/**
 * message-sender.js
 * WhatsApp Web üzerinden otomatik mesaj gönderir.
 * QR kodu terminalde gösterir, bağlantı kurulduktan sonra mesaj gönderir.
 * 
 * Kullanım: node message-sender.js
 */

require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

// ── Konfigürasyon ──────────────────────────────────────────────
const CONFIG = {
  maxDailyMessages: parseInt(process.env.MAX_DAILY_MESSAGES) || 50,
  delayMin: (parseInt(process.env.DELAY_MIN) || 30) * 1000,
  delayMax: (parseInt(process.env.DELAY_MAX) || 90) * 1000
};

// ── Kategori Bazlı Mesaj Şablonları ────────────────────────────
const MESSAGE_TEMPLATES = {
  berber: [
    'Merhaba {isim} 👋\n\nBen bir web tasarımcısıyım. İşletmenizin Google Maps\'te olduğunu gördüm fakat web siteniz olmadığını fark ettim.\n\nGünümüzde müşterilerinizin %70\'i sizi internetten arıyor. Profesyonel bir web sitesi ile:\n✅ Online randevu sistemi\n✅ Hizmet ve fiyat listesi\n✅ Müşteri yorumları\n✅ Google\'da üst sıralara çıkma\n\nBunların hepsini uygun fiyata sunabilirim. Detaylı bilgi için bana yazabilir misiniz? 🙏',
  ],
  kuaför: [
    'Merhaba {isim} 👋\n\nSakarya\'da kuaför salonlarına özel web sitesi tasarlıyorum. İşletmenizin henüz bir web sitesi olmadığını gördüm.\n\nModern bir web sitesi ile:\n✅ Saç modeli galeri sayfası\n✅ Online randevu\n✅ Fiyat listesi\n✅ Instagram entegrasyonu\n\nSizi de dijitale taşımak isterim. Bilgi almak ister misiniz? 😊',
  ],
  'oto tamirci': [
    'Merhaba {isim} 👋\n\nOto tamir sektörüne özel web sitesi çözümleri sunuyorum. İşletmenizin web sitesinin olmadığını fark ettim.\n\nBir web sitesi ile:\n✅ Verdiğiniz hizmetleri listeleyin\n✅ Müşterileriniz sizi Google\'da bulsun\n✅ Online randevu ve iletişim formu\n✅ Referans çalışmalarınızı sergileyin\n\nUygun fiyatlı çözümlerimiz var. İlgilenirseniz detay paylaşabilirim 🔧',
  ],
  lokanta: [
    'Merhaba {isim} 👋\n\nRestoranınızı Google Maps\'te gördüm, {yorum_sayisi} yorumla harika bir işletmesiniz! 🍽️\n\nFakat web sitenizin olmadığını fark ettim. Modern bir web sitesi ile:\n✅ Online menü\n✅ Sipariş/rezervasyon sistemi\n✅ Fotoğraf galerisi\n✅ Google\'da daha çok görünürlük\n\nUygun fiyatlı profesyonel çözümler sunuyorum. İlgilenir misiniz? 😊',
  ],
  kafe: [
    'Merhaba {isim} ☕\n\nKafenizi Google Maps\'te gördüm, çok güzel bir mekan!\n\nBir web sitesi ile müşterileriniz sizi daha kolay bulabilir:\n✅ Menü ve fiyat listesi\n✅ Mekan fotoğrafları\n✅ Konum ve çalışma saatleri\n✅ Sosyal medya entegrasyonu\n\nKafeler için özel tasarımlarım var. Detay paylaşabilir miyim? 🙏',
  ],
  fırın: [
    'Merhaba {isim} 🍞\n\nFırınınızın Google Maps\'te olduğunu ama web sitesinin olmadığını gördüm.\n\nBasit ve etkili bir web sitesi ile:\n✅ Ürün kataloğu\n✅ Sipariş hattı bilgileri\n✅ Google\'da öne çıkma\n✅ Çalışma saatleri ve konum\n\nUygun fiyatlı çözümlerimiz var. Bilgi almak ister misiniz? 😊',
  ],
  eczane: [
    'Merhaba {isim} 💊\n\nEczanenizin Google Maps\'te olduğunu ama web sitesinin olmadığını fark ettim.\n\nBir web sitesi ile:\n✅ Nöbet bilgileri\n✅ İletişim ve konum bilgileri\n✅ Hizmetlerinizi tanıtma\n✅ Google aramalarda öne çıkma\n\nEczanelere özel uygun fiyatlı çözümlerimiz var. İlgilenirseniz detay paylaşabilirim 🙏',
  ],
  avukat: [
    'Merhaba {isim} ⚖️\n\nAvukatlık büronuzun Google Maps\'te olduğunu gördüm. Profesyonel bir web sitesi ile:\n✅ Uzmanlık alanlarınızı tanıtın\n✅ Online danışma randevusu\n✅ Referanslar ve başarı hikayeleri\n✅ Google\'da öne çıkın\n\nHukuk bürolarına özel tasarımlarım var. Detaylı bilgi paylaşabilir miyim? 🙏',
  ],
  muhasebeci: [
    'Merhaba {isim} 📊\n\nMuhasebe büronuzun web sitesinin olmadığını fark ettim.\n\nProfesyonel bir web sitesi ile:\n✅ Hizmetlerinizi tanıtın\n✅ Online randevu sistemi\n✅ Müşteri portföyünüzü genişletin\n✅ Güvenilir bir imaj oluşturun\n\nUygun fiyatlı çözümlerimiz var. İlgilenir misiniz? 😊',
  ],
  emlakçı: [
    'Merhaba {isim} 🏠\n\nEmlak ofisinizin web sitesinin olmadığını gördüm.\n\nBir web sitesi ile:\n✅ İlan portföyünüzü sergileyin\n✅ Online müşteri başvuru formu\n✅ Sanal tur desteği\n✅ Google\'da emlak arayanlar sizi bulsun\n\nEmlakçılara özel çözümlerimiz var. Detay paylaşabilir miyim? 🏡',
  ],
  elektrikçi: [
    'Merhaba {isim} ⚡\n\nElektrik hizmetlerinizi Google Maps\'te gördüm. Web siteniz olmadan müşterileriniz sizi zor buluyor olabilir.\n\nBir web sitesi ile:\n✅ Hizmet alanlarınızı tanıtın\n✅ Acil çağrı hattı bilgisi\n✅ Referans işlerinizi paylaşın\n✅ Google\'da öne çıkın\n\nUygun fiyatlı çözümlerim var. İlgilenir misiniz? 🔌',
  ],
  mobilyacı: [
    'Merhaba {isim} 🪑\n\nMobilya mağazanızın web sitesinin olmadığını fark ettim.\n\nBir web sitesi ile:\n✅ Ürün kataloğu ve fotoğraflar\n✅ Online fiyat teklifi\n✅ Müşteri yorumları\n✅ Google\'da mobilya arayanlar sizi bulsun\n\nMobilyacılara özel tasarımlarım var. Bilgi almak ister misiniz? 😊',
  ],
  'düğün salonu': [
    'Merhaba {isim} 💒\n\nDüğün salonunuzu Google Maps\'te gördüm, harika bir mekan!\n\nBir web sitesi ile:\n✅ Salon fotoğraf galerisi\n✅ Paket ve fiyat bilgileri\n✅ Online rezervasyon formu\n✅ Referans düğün videoları\n\nDüğün salonlarına özel muhteşem tasarımlarım var. Detay paylaşabilir miyim? 💐',
  ],
  nakliyat: [
    'Merhaba {isim} 🚛\n\nNakliyat firmanızın web sitesinin olmadığını gördüm.\n\nBir web sitesi ile:\n✅ Hizmet bölgelerinizi gösterin\n✅ Online teklif formu\n✅ Araç filonuzu tanıtın\n✅ Google\'da nakliyat arayanlar sizi bulsun\n\nUygun fiyatlı çözümlerim var. İlgilenirseniz detay verebilirim 📦',
  ],
  kuyumcu: [
    'Merhaba {isim} 💎\n\nKuyumcu dükkânınızın web sitesinin olmadığını fark ettim.\n\nBir web sitesi ile:\n✅ Ürün kataloğu ve vitrininiz online olsun\n✅ Altın fiyatları widget\'ı\n✅ Google\'da kuyumcu arayanlar sizi bulsun\n✅ Güvenilir ve prestijli bir görünüm\n\nKuyumculara özel tasarımlarım var. Bilgi almak ister misiniz? ✨',
  ]
};

// Varsayılan şablon (kategorisi eşleşmezse)
const DEFAULT_TEMPLATE = 'Merhaba {isim} 👋\n\nİşletmenizi Google Maps\'te gördüm fakat web siteniz olmadığını fark ettim.\n\nGünümüzde müşterilerin büyük çoğunluğu internetten araştırma yapıyor. Profesyonel bir web sitesi ile:\n✅ Daha fazla müşteriye ulaşın\n✅ Google\'da öne çıkın\n✅ 7/24 açık bir vitrininiz olsun\n✅ Profesyonel bir imaj oluşturun\n\nUygun fiyatlı web sitesi çözümleri sunuyorum. Detaylı bilgi için bana yazabilir misiniz? 🙏';

// ── Mesaj Log Veritabanı ───────────────────────────────────────
function initMessageLog() {
  const dbPath = path.join(__dirname, 'messages_log.db');
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS message_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      isim TEXT NOT NULL,
      telefon TEXT NOT NULL,
      kategori TEXT,
      mesaj TEXT,
      gonderim_zamani TEXT DEFAULT (datetime('now', 'localtime')),
      durum TEXT DEFAULT 'gonderildi',
      hata_mesaji TEXT
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_stats (
      tarih TEXT PRIMARY KEY,
      gonderilen INTEGER DEFAULT 0,
      basarili INTEGER DEFAULT 0,
      basarisiz INTEGER DEFAULT 0
    )
  `);

  console.log('✅ Mesaj log veritabanı hazır: messages_log.db');
  return db;
}

// ── Yardımcı Fonksiyonlar ──────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay() {
  const delay = Math.floor(Math.random() * (CONFIG.delayMax - CONFIG.delayMin + 1)) + CONFIG.delayMin;
  return delay;
}

function getMessageForCategory(kategori, customer) {
  const templates = MESSAGE_TEMPLATES[kategori] || [DEFAULT_TEMPLATE];
  let message = templates[Math.floor(Math.random() * templates.length)];

  // Yer tutucuları değiştir
  message = message.replace(/{isim}/g, customer.isim || 'Sayın İşletme');
  message = message.replace(/{kategori}/g, customer.kategori || '');
  message = message.replace(/{ilce}/g, customer.ilce || 'Sakarya');
  message = message.replace(/{yorum_sayisi}/g, customer.yorum_sayisi || '');
  message = message.replace(/{puan}/g, customer.puan || '');

  return message;
}

function getTodayString() {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

function getTodayMessageCount(logDb) {
  const today = getTodayString();
  const row = logDb.prepare('SELECT gonderilen FROM daily_stats WHERE tarih = ?').get(today);
  return row ? row.gonderilen : 0;
}

// ── WhatsApp İstemcisi ─────────────────────────────────────────
function createWhatsAppClient() {
  const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
  });

  return client;
}

// ── Mesaj Gönderim Fonksiyonu ──────────────────────────────────
async function sendMessages(client, customersDb, logDb) {
  const today = getTodayString();

  // Bugün kaç mesaj gönderilmiş?
  let sentToday = getTodayMessageCount(logDb);
  console.log(`📊 Bugün gönderilen mesaj: ${sentToday}/${CONFIG.maxDailyMessages}`);

  if (sentToday >= CONFIG.maxDailyMessages) {
    console.log('⚠️ Günlük mesaj limiti doldu! Yarın tekrar deneyin.');
    return;
  }

  // ── TELEFON BAZLI DUPLIKE ENGELLEME ──
  // message_log'daki TÜM telefonları al (hata dahil - bir kez denenen tekrar denenmez)
  const allAttemptedPhones = new Set(
    logDb.prepare('SELECT DISTINCT telefon FROM message_log').all().map(r => r.telefon)
  );

  // customers.db'de mesaj_gonderildi olan telefonları da ekle
  const alreadySentInCustomers = customersDb.prepare(
    "SELECT DISTINCT telefon FROM customers WHERE durum IN ('mesaj_gonderildi', 'numara_kayitsiz', 'donus_yapti', 'musteri_oldu') AND telefon IS NOT NULL AND telefon != ''"
  ).all().map(r => r.telefon);
  
  for (const p of alreadySentInCustomers) {
    allAttemptedPhones.add(p);
  }

  console.log(`🔒 Daha önce işlem yapılmış ${allAttemptedPhones.size} benzersiz telefon numarası atlanacak`);

  // Gönderilecek müşterileri al - HER TELEFON İÇİN SADECE BİR TANE
  const targetIl = process.env.TARGET_IL || null;
  const targetIlce = process.env.TARGET_ILCE || null;
  const targetKategori = process.env.TARGET_KATEGORI || null;
  
  let queryConditions = "WHERE telefon IS NOT NULL AND telefon != '' AND durum NOT IN ('mesaj_gonderildi', 'numara_kayitsiz', 'donus_yapti', 'musteri_oldu', 'ilgilenmiyor')";
  const queryParams = [];

  if (targetIl && targetIlce) {
    // Hem il hem ilçe seçili -> DB'de "İlçe, İl" veya sadece "İlçe" formatında olabilir
    // Sakarya ilçeleri sadece ilçe adıyla kayıtlı, diğerleri "İlçe, İl" formatında
    if (targetIl === 'Sakarya') {
      queryConditions += " AND ilce = ?";
      queryParams.push(targetIlce);
    } else {
      queryConditions += " AND ilce = ?";
      queryParams.push(`${targetIlce}, ${targetIl}`);
    }
    console.log(`📍 Hedef: ${targetIlce}, ${targetIl} için filtreleme yapılıyor...`);
  } else if (targetIl) {
    // Sadece il seçili -> o ile ait tüm ilçeleri getir
    if (targetIl === 'Sakarya') {
      // Sakarya ilçeleri virgüllü format kullanmaz, virgül İÇERMEYEN kayıtları al
      queryConditions += " AND ilce NOT LIKE '%,%'";
    } else {
      // Diğer iller "İlçe, İl" formatında -> LIKE ile ara
      queryConditions += " AND ilce LIKE ?";
      queryParams.push(`%, ${targetIl}`);
    }
    console.log(`📍 Hedef İl: ${targetIl} için filtreleme yapılıyor...`);
  } else if (targetIlce) {
    // Sadece ilçe seçili (il seçilmemiş) -> doğrudan ilçe adıyla ara
    queryConditions += " AND (ilce = ? OR ilce LIKE ?)";
    queryParams.push(targetIlce, `${targetIlce},%`);
    console.log(`📍 Hedef İlçe: ${targetIlce} için filtreleme yapılıyor...`);
  }
  
  if (targetKategori) {
    queryConditions += " AND kategori = ?";
    queryParams.push(targetKategori);
    console.log(`📂 Hedef Kategori: ${targetKategori} için filtreleme yapılıyor...`);
  }

  const allCandidates = customersDb.prepare(`
    SELECT * FROM customers
    ${queryConditions}
    ORDER BY oncelik_skoru DESC
  `).all(...queryParams);

  // Telefon bazlı filtreleme (Set ile hızlı kontrol)
  const customers = [];
  const seenPhones = new Set();
  for (const c of allCandidates) {
    if (allAttemptedPhones.has(c.telefon)) continue;  // Daha önce denendi
    if (seenPhones.has(c.telefon)) continue;           // Bu batch'de zaten var
    seenPhones.add(c.telefon);
    customers.push(c);
    if (customers.length >= CONFIG.maxDailyMessages - sentToday) break;
  }

  if (customers.length === 0) {
    console.log('✅ Gönderilecek müşteri kalmadı!');
    return;
  }

  console.log(`\n📨 ${customers.length} müşteriye mesaj gönderilecek...\n`);

  // Günlük stats kaydı oluştur/güncelle
  logDb.prepare(`
    INSERT OR IGNORE INTO daily_stats (tarih, gonderilen, basarili, basarisiz) VALUES (?, 0, 0, 0)
  `).run(today);

  const updateDailyStats = logDb.prepare(`
    UPDATE daily_stats SET gonderilen = gonderilen + 1, basarili = basarili + ? , basarisiz = basarisiz + ? WHERE tarih = ?
  `);

  const insertLog = logDb.prepare(`
    INSERT INTO message_log (customer_id, isim, telefon, kategori, mesaj, durum, hata_mesaji)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  // Aynı telefona sahip TÜM müşterilerin durumunu güncelle
  const updateAllByPhone = customersDb.prepare(`
    UPDATE customers SET durum = ? WHERE telefon = ?
  `);

  for (let i = 0; i < customers.length; i++) {
    const customer = customers[i];
    const remaining = CONFIG.maxDailyMessages - sentToday;

    if (remaining <= 0) {
      console.log('\n⚠️ Günlük limit doldu!');
      break;
    }

    console.log(`\n[${i + 1}/${customers.length}] 📤 ${customer.isim}`);
    console.log(`   📱 ${customer.telefon} | 📂 ${customer.kategori} | 📍 ${customer.ilce}`);

    // Son dakika duplike kontrolü (gönderim sırasında eklenen kayıtlar için)
    if (allAttemptedPhones.has(customer.telefon)) {
      console.log('   ⏭️ Bu telefona zaten mesaj gönderildi, atlanıyor.');
      continue;
    }

    const message = getMessageForCategory(customer.kategori, customer);
    const chatId = customer.telefon + '@c.us';

    try {
      // Numaranın WhatsApp'ta kayıtlı olup olmadığını kontrol et
      const isRegistered = await client.isRegisteredUser(chatId);

      if (!isRegistered) {
        console.log('   ❌ WhatsApp\'ta kayıtlı değil, atlanıyor.');
        insertLog.run(customer.id, customer.isim, customer.telefon, customer.kategori, '', 'numara_kayitsiz', 'WhatsApp\'ta kayıtlı değil');
        updateAllByPhone.run('numara_kayitsiz', customer.telefon);
        allAttemptedPhones.add(customer.telefon);
        updateDailyStats.run(0, 1, today);
        sentToday++;
        continue;
      }

      // Mesajı gönder
      await client.sendMessage(chatId, message);
      console.log('   ✅ Mesaj gönderildi!');

      insertLog.run(customer.id, customer.isim, customer.telefon, customer.kategori, message, 'gonderildi', null);
      updateAllByPhone.run('mesaj_gonderildi', customer.telefon);
      allAttemptedPhones.add(customer.telefon);
      updateDailyStats.run(1, 0, today);
      sentToday++;

    } catch (err) {
      console.log(`   ❌ Hata: ${err.message}`);
      insertLog.run(customer.id, customer.isim, customer.telefon, customer.kategori, '', 'hata', err.message);
      updateDailyStats.run(0, 1, today);
      sentToday++;
    }

    // Mesajlar arası rastgele bekleme
    if (i < customers.length - 1) {
      const delay = randomDelay();
      console.log(`   ⏳ ${(delay / 1000).toFixed(0)} saniye bekleniyor...`);
      await sleep(delay);
    }
  }

  // Özet
  const stats = logDb.prepare('SELECT * FROM daily_stats WHERE tarih = ?').get(today);
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  📊 GÜNLÜK MESAJ ÖZETİ');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  📅 Tarih      : ${today}`);
  console.log(`  📨 Gönderilen : ${stats.gonderilen}`);
  console.log(`  ✅ Başarılı   : ${stats.basarili}`);
  console.log(`  ❌ Başarısız  : ${stats.basarisiz}`);
  console.log('═══════════════════════════════════════════════════\n');
}

// ── Ana Fonksiyon ──────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  📱 WHATSAPP MESAJ GÖNDERİCİ');
  console.log('═══════════════════════════════════════════════════\n');

  // Müşteri veritabanını kontrol et
  const customersDbPath = path.join(__dirname, 'customers.db');
  if (!fs.existsSync(customersDbPath)) {
    console.log('❌ customers.db bulunamadı! Önce maps-scraper.js çalıştırın.');
    process.exit(1);
  }

  const customersDb = new DatabaseSync(customersDbPath);
  const logDb = initMessageLog();

  console.log('📱 WhatsApp Web başlatılıyor...');
  console.log('   QR kodu telefonunuzla tarayın.\n');

  const client = createWhatsAppClient();
  
  // ready event'inin birden fazla kez tetiklenmesini önle
  let isSending = false;

  client.on('qr', (qr) => {
    fs.writeFileSync(path.join(__dirname, 'qr.txt'), qr);
    console.log('📷 QR KODU (telefonunuzla tarayın):');
    console.log('');
    qrcode.generate(qr, { small: true });
    console.log('');
  });

  client.on('loading_screen', (percent, message) => {
    console.log(`⏳ Yükleniyor: ${percent}% - ${message}`);
  });

  client.on('authenticated', () => {
    fs.writeFileSync(path.join(__dirname, 'qr.txt'), 'CONNECTED');
    console.log('✅ Kimlik doğrulandı!');
  });

  client.on('auth_failure', (msg) => {
    console.error('❌ Kimlik doğrulama hatası:', msg);
    customersDb.close();
    logDb.close();
    process.exit(1);
  });

  client.on('ready', async () => {
    console.log('\n✅ WhatsApp bağlantısı hazır!\n');

    // Zaten mesaj gönderme işlemi devam ediyorsa tekrar başlatma
    if (isSending) {
      console.log('⚠️ Mesaj gönderme zaten devam ediyor, tekrar başlatılmadı.');
      return;
    }
    isSending = true;

    try {
      await sendMessages(client, customersDb, logDb);
    } catch (err) {
      console.error('❌ Mesaj gönderme hatası:', err.message);
    } finally {
      isSending = false;
      console.log('🔒 Bağlantı kapatılıyor...');
      await client.destroy();
      customersDb.close();
      logDb.close();
      console.log('👋 Tamamlandı!');
    }
  });

  client.on('disconnected', (reason) => {
    console.log('🔴 WhatsApp bağlantısı koptu:', reason);
    process.exit(1);
  });

  // Güvenli kapanış
  process.on('SIGINT', async () => {
    if (client) await client.destroy().catch(() => {});
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    if (client) await client.destroy().catch(() => {});
    process.exit(0);
  });

  client.initialize();
}

// Module export (dashboard için)
module.exports = { createWhatsAppClient, sendMessages, initMessageLog, CONFIG };

// Doğrudan çalıştırılırsa
if (require.main === module) {
  main().catch(console.error);
}
