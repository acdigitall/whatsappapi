/**
 * data-manager.js
 * Müşteri havuzunu yönetir, öncelik skoru hesaplar, CSV export yapar.
 * 
 * Kullanım: node data-manager.js
 */

require('dotenv').config();
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

// ── Veritabanı Bağlantısı ──────────────────────────────────────
function openDatabase() {
  const dbPath = path.join(__dirname, 'customers.db');

  if (!fs.existsSync(dbPath)) {
    console.log('❌ customers.db bulunamadı! Önce maps-scraper.js çalıştırın.');
    process.exit(1);
  }

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');

  // Öncelik skoru kolonu ekle (yoksa)
  try {
    db.exec(`ALTER TABLE customers ADD COLUMN oncelik_skoru INTEGER DEFAULT 0`);
    console.log('✅ oncelik_skoru kolonu eklendi.');
  } catch {
    // Kolon zaten var
  }

  return db;
}

// ── Öncelik Skoru Hesaplama ────────────────────────────────────
function calculatePriorityScores(db) {
  console.log('\n📊 Öncelik skorları hesaplanıyor...');

  const customers = db.prepare('SELECT * FROM customers').all();
  const updateStmt = db.prepare('UPDATE customers SET oncelik_skoru = ? WHERE id = ?');

  db.exec('BEGIN');
  try {
    for (const c of customers) {
      let score = 0;

      // Telefon numarası varsa +30 puan
      if (c.telefon && c.telefon.length >= 10) {
        score += 30;
      }

      // 20'den fazla yorum varsa +20 puan
      if (c.yorum_sayisi > 20) {
        score += 20;
      }

      // Puanı 4'ten yüksekse +15 puan
      if (c.puan > 4) {
        score += 15;
      }

      // Puanı 3'ten yüksekse +5 puan (ek bonus)
      if (c.puan > 3 && c.puan <= 4) {
        score += 5;
      }

      // 50'den fazla yorum +10 bonus
      if (c.yorum_sayisi > 50) {
        score += 10;
      }

      // 100'den fazla yorum +5 ekstra bonus
      if (c.yorum_sayisi > 100) {
        score += 5;
      }

      updateStmt.run(score, c.id);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  console.log(`✅ ${customers.length} müşterinin skoru güncellendi.`);
}

// ── CSV Export ──────────────────────────────────────────────────
function exportToCSV(db) {
  const exportDir = path.join(__dirname, 'exports');
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }

  // Tüm müşteriler
  const allCustomers = db.prepare(`
    SELECT id, isim, kategori, adres, ilce, telefon, puan, yorum_sayisi, oncelik_skoru, durum, ekleme_tarihi
    FROM customers
    ORDER BY oncelik_skoru DESC
  `).all();

  const headers = 'ID,İsim,Kategori,Adres,İlçe,Telefon,Puan,Yorum Sayısı,Öncelik Skoru,Durum,Ekleme Tarihi';

  function toCSVRow(c) {
    return [
      c.id,
      `"${(c.isim || '').replace(/"/g, '""')}"`,
      `"${c.kategori || ''}"`,
      `"${(c.adres || '').replace(/"/g, '""')}"`,
      `"${c.ilce || ''}"`,
      c.telefon || '',
      c.puan || 0,
      c.yorum_sayisi || 0,
      c.oncelik_skoru || 0,
      c.durum || '',
      c.ekleme_tarihi || ''
    ].join(',');
  }

  // tum_musteriler.csv
  const allCSV = [headers, ...allCustomers.map(toCSVRow)].join('\n');
  const allPath = path.join(exportDir, 'tum_musteriler.csv');
  fs.writeFileSync(allPath, '\uFEFF' + allCSV, 'utf-8'); // BOM for Excel uyumu
  console.log(`\n📁 Tüm müşteriler: ${allPath} (${allCustomers.length} kayıt)`);

  // yuksek_oncelikli.csv (skor >= 50)
  const highPriority = allCustomers.filter(c => c.oncelik_skoru >= 50);
  const highCSV = [headers, ...highPriority.map(toCSVRow)].join('\n');
  const highPath = path.join(exportDir, 'yuksek_oncelikli.csv');
  fs.writeFileSync(highPath, '\uFEFF' + highCSV, 'utf-8');
  console.log(`📁 Yüksek öncelikli: ${highPath} (${highPriority.length} kayıt)`);
}

// ── Konsol Özet Tablosu ────────────────────────────────────────
function printSummary(db) {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  📊 MÜŞTERİ HAVUZU ÖZETİ');
  console.log('═══════════════════════════════════════════════════\n');

  // Genel istatistikler
  const total = db.prepare('SELECT COUNT(*) as c FROM customers').get().c;
  const withPhone = db.prepare("SELECT COUNT(*) as c FROM customers WHERE telefon IS NOT NULL AND telefon != ''").get().c;
  const withoutPhone = total - withPhone;
  const avgScore = db.prepare('SELECT AVG(oncelik_skoru) as avg FROM customers').get().avg || 0;
  const highPriority = db.prepare('SELECT COUNT(*) as c FROM customers WHERE oncelik_skoru >= 50').get().c;

  console.log(`  📋 Toplam müşteri     : ${total}`);
  console.log(`  📱 Telefonu olan       : ${withPhone}`);
  console.log(`  ❌ Telefonu olmayan    : ${withoutPhone}`);
  console.log(`  ⭐ Ort. öncelik skoru  : ${avgScore.toFixed(1)}`);
  console.log(`  🔥 Yüksek öncelikli   : ${highPriority}`);

  // Kategoriye göre dağılım
  console.log('\n───────────────────────────────────────────────────');
  console.log('  📂 KATEGORİYE GÖRE DAĞILIM');
  console.log('───────────────────────────────────────────────────');

  const byCategory = db.prepare(`
    SELECT kategori, COUNT(*) as toplam,
           SUM(CASE WHEN telefon IS NOT NULL AND telefon != '' THEN 1 ELSE 0 END) as telefonlu
    FROM customers
    GROUP BY kategori
    ORDER BY toplam DESC
  `).all();

  const catHeader = '  Kategori'.padEnd(22) + 'Toplam'.padStart(8) + 'Telefonlu'.padStart(12);
  console.log(catHeader);
  console.log('  ' + '─'.repeat(40));

  for (const cat of byCategory) {
    const line = `  ${cat.kategori.padEnd(20)}${String(cat.toplam).padStart(8)}${String(cat.telefonlu).padStart(12)}`;
    console.log(line);
  }

  // İlçeye göre dağılım
  console.log('\n───────────────────────────────────────────────────');
  console.log('  📍 İLÇEYE GÖRE DAĞILIM');
  console.log('───────────────────────────────────────────────────');

  const byDistrict = db.prepare(`
    SELECT ilce, COUNT(*) as toplam,
           SUM(CASE WHEN telefon IS NOT NULL AND telefon != '' THEN 1 ELSE 0 END) as telefonlu
    FROM customers
    GROUP BY ilce
    ORDER BY toplam DESC
  `).all();

  const distHeader = '  İlçe'.padEnd(22) + 'Toplam'.padStart(8) + 'Telefonlu'.padStart(12);
  console.log(distHeader);
  console.log('  ' + '─'.repeat(40));

  for (const dist of byDistrict) {
    const line = `  ${(dist.ilce || 'Bilinmiyor').padEnd(20)}${String(dist.toplam).padStart(8)}${String(dist.telefonlu).padStart(12)}`;
    console.log(line);
  }

  // Öncelik dağılımı
  console.log('\n───────────────────────────────────────────────────');
  console.log('  🎯 ÖNCELİK DAĞILIMI');
  console.log('───────────────────────────────────────────────────');

  const priorities = [
    { label: '🔥 Yüksek (≥50)', query: 'SELECT COUNT(*) as c FROM customers WHERE oncelik_skoru >= 50' },
    { label: '🟡 Orta (30-49)', query: 'SELECT COUNT(*) as c FROM customers WHERE oncelik_skoru >= 30 AND oncelik_skoru < 50' },
    { label: '⚪ Düşük (<30)', query: 'SELECT COUNT(*) as c FROM customers WHERE oncelik_skoru < 30' }
  ];

  for (const p of priorities) {
    const count = db.prepare(p.query).get().c;
    const bar = '█'.repeat(Math.min(Math.ceil(count / Math.max(total, 1) * 30), 30));
    console.log(`  ${p.label.padEnd(22)} ${String(count).padStart(5)}  ${bar}`);
  }

  console.log('\n═══════════════════════════════════════════════════\n');
}

// ── Top 10 Müşteri ─────────────────────────────────────────────
function printTopCustomers(db) {
  console.log('  🏆 EN YÜKSEK ÖNCELİKLİ 10 MÜŞTERİ');
  console.log('───────────────────────────────────────────────────');

  const topCustomers = db.prepare(`
    SELECT isim, kategori, ilce, telefon, puan, yorum_sayisi, oncelik_skoru
    FROM customers
    WHERE telefon IS NOT NULL AND telefon != ''
    ORDER BY oncelik_skoru DESC
    LIMIT 10
  `).all();

  for (let i = 0; i < topCustomers.length; i++) {
    const c = topCustomers[i];
    console.log(`  ${i + 1}. ${c.isim}`);
    console.log(`     📂 ${c.kategori} | 📍 ${c.ilce} | ⭐ ${c.puan} | 💬 ${c.yorum_sayisi} | 🎯 Skor: ${c.oncelik_skoru}`);
    console.log(`     📱 ${c.telefon}`);
  }

  console.log('');
}

// ── Ana Fonksiyon ──────────────────────────────────────────────
function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  📋 MÜŞTERİ VERİ YÖNETİCİSİ');
  console.log('═══════════════════════════════════════════════════\n');

  const db = openDatabase();

  try {
    calculatePriorityScores(db);
    exportToCSV(db);
    printSummary(db);
    printTopCustomers(db);

    console.log('💡 Sonraki adım: node message-sender.js');
  } catch (err) {
    console.error('❌ Hata:', err.message);
  } finally {
    db.close();
  }
}

// Module olarak da kullanılabilir
module.exports = { openDatabase, calculatePriorityScores };

// Doğrudan çalıştırılırsa
if (require.main === module) {
  main();
}
