/**
 * send-custom.js
 * Tek bir müşteriye özel mesaj gönderir.
 * Dashboard tarafından spawn edilir.
 * 
 * Kullanım: node send-custom.js <logId>
 * logId: messages_log.db'deki bekleyen mesaj kaydının ID'si
 */

require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const logId = process.argv[2];

if (!logId) {
  console.error('❌ Kullanım: node send-custom.js <logId>');
  process.exit(1);
}

async function main() {
  console.log(`📨 Özel mesaj gönderiliyor (Log ID: ${logId})...`);

  // Veritabanından bekleyen mesajı oku
  const logDb = new DatabaseSync(path.join(__dirname, 'messages_log.db'));
  logDb.exec('PRAGMA journal_mode = WAL');

  const msg = logDb.prepare('SELECT * FROM message_log WHERE id = ? AND durum = ?').get(parseInt(logId), 'beklemede');

  if (!msg) {
    console.log('❌ Bekleyen mesaj bulunamadı (ID: ' + logId + ')');
    logDb.close();
    process.exit(1);
  }

  console.log(`📱 Alıcı: ${msg.isim} (${msg.telefon})`);
  console.log(`📝 Mesaj tipi: ${msg.mesaj_tipi || 'ozel'}`);

  const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
  });

  let isSending = false;

  client.on('qr', () => {
    console.log('⚠️ WhatsApp oturumu bulunamadı. Önce message-sender.js ile QR kodu tarayın.');
    logDb.prepare('UPDATE message_log SET durum = ?, hata_mesaji = ? WHERE id = ?')
      .run('hata', 'WhatsApp oturumu yok - QR taranmamış', parseInt(logId));
    logDb.close();
    process.exit(1);
  });

  client.on('authenticated', () => {
    console.log('✅ WhatsApp kimlik doğrulandı!');
  });

  client.on('ready', async () => {
    if (isSending) return;
    isSending = true;

    console.log('✅ WhatsApp hazır, mesaj gönderiliyor...');

    try {
      const chatId = msg.telefon + '@c.us';

      // Numaranın WhatsApp'ta kayıtlı olup olmadığını kontrol et
      const isRegistered = await client.isRegisteredUser(chatId);
      if (!isRegistered) {
        console.log('❌ Numara WhatsApp\'ta kayıtlı değil.');
        logDb.prepare('UPDATE message_log SET durum = ?, hata_mesaji = ? WHERE id = ?')
          .run('hata', 'Numara WhatsApp\'ta kayıtlı değil', parseInt(logId));
        await client.destroy();
        logDb.close();
        process.exit(1);
      }

      // Mesajı gönder
      await client.sendMessage(chatId, msg.mesaj);
      console.log('✅ Mesaj başarıyla gönderildi!');

      // Log'u güncelle
      logDb.prepare('UPDATE message_log SET durum = ?, gonderim_zamani = datetime(\'now\', \'localtime\') WHERE id = ?')
        .run('gonderildi', parseInt(logId));

      // Müşteri durumunu güncelle
      const custDb = new DatabaseSync(path.join(__dirname, 'customers.db'));
      custDb.exec('PRAGMA journal_mode = WAL');
      custDb.prepare('UPDATE customers SET durum = CASE WHEN durum = \'donus_yapti\' THEN \'donus_yapti\' ELSE \'mesaj_gonderildi\' END WHERE id = ?')
        .run(msg.customer_id);
      custDb.close();

    } catch (err) {
      console.error('❌ Gönderim hatası:', err.message);
      logDb.prepare('UPDATE message_log SET durum = ?, hata_mesaji = ? WHERE id = ?')
        .run('hata', err.message, parseInt(logId));
    } finally {
      await client.destroy();
      logDb.close();
      console.log('👋 Tamamlandı.');
      process.exit(0);
    }
  });

  client.on('auth_failure', (msg) => {
    console.error('❌ Kimlik doğrulama hatası:', msg);
    logDb.prepare('UPDATE message_log SET durum = ?, hata_mesaji = ? WHERE id = ?')
      .run('hata', 'Kimlik doğrulama hatası', parseInt(logId));
    logDb.close();
    process.exit(1);
  });

  await client.initialize();
}

main().catch(err => {
  console.error('❌ Kritik hata:', err.message);
  process.exit(1);
});
