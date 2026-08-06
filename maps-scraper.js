/**
 * maps-scraper.js
 * Google Maps'ten belirtilen lokasyonlardaki web sitesi olmayan işletmeleri bulur
 * ve customers.db'ye kaydeder.
 * 
 * Kullanım: node maps-scraper.js
 */

require('dotenv').config();
const { chromium } = require('playwright');
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const fs = require('fs');

let dynamicConfig = null;
try {
  const cfgPath = path.join(__dirname, 'scraper-config.json');
  if (fs.existsSync(cfgPath)) {
    dynamicConfig = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  }
} catch(e) {}

// ── Konfigürasyon ──────────────────────────────────────────────
const CONFIG = {
  headless: process.env.HEADLESS !== 'false',
  scrollCount: parseInt(process.env.SCROLL_COUNT) || 5,
  ilceler: dynamicConfig?.locations || [
    'Adapazarı', 'Akyazı', 'Arifiye', 'Erenler', 'Ferizli',
    'Geyve', 'Hendek', 'Karasu', 'Kaynarca',
    'Kocaali', 'Pamukova', 'Sapanca', 'Serdivan', 'Söğütlü', 'Taraklı'
  ],
  kategoriler: dynamicConfig?.categories || [
    'güzellik salonu', 'diyetisyen', 'pet kuaför', 'diş kliniği', 'psikolog', 'fizyoterapist',
    'eczane', 'avukat', 'muhasebeci', 'emlakçı', 'mimar', 'davet salonu',
    'elektrikçi', 'nakliyat', 'kuyumcu'
  ]
};

// ── Veritabanı Kurulumu ────────────────────────────────────────
function initDatabase() {
  const dbPath = path.join(__dirname, 'customers.db');
  const db = new DatabaseSync(dbPath);

  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      isim TEXT NOT NULL,
      kategori TEXT NOT NULL,
      adres TEXT,
      ilce TEXT,
      telefon TEXT,
      puan REAL,
      yorum_sayisi INTEGER DEFAULT 0,
      google_url TEXT UNIQUE,
      web_sitesi TEXT,
      oncelik_skoru INTEGER DEFAULT 0,
      ekleme_tarihi TEXT DEFAULT (datetime('now', 'localtime')),
      durum TEXT DEFAULT 'yeni'
    )
  `);

  // Tarama geçmişi tablosu — hangi ilçe+kategori tarandı?
  db.exec(`
    CREATE TABLE IF NOT EXISTS scan_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ilce TEXT NOT NULL,
      kategori TEXT NOT NULL,
      tarih TEXT DEFAULT (datetime('now', 'localtime')),
      sonuc_sayisi INTEGER DEFAULT 0,
      UNIQUE(ilce, kategori)
    )
  `);

  console.log('✅ Veritabanı hazır: customers.db');
  return db;
}

// ── Yardımcı Fonksiyonlar ──────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(min = 1000, max = 3000) {
  return sleep(Math.floor(Math.random() * (max - min + 1)) + min);
}

function normalizePhone(phone) {
  if (!phone) return null;
  // Türkiye telefon numarası normalizasyonu
  let cleaned = phone.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '90' + cleaned.slice(1);
  }
  if (!cleaned.startsWith('90') && !cleaned.startsWith('+90')) {
    cleaned = '90' + cleaned;
  }
  cleaned = cleaned.replace(/^\+/, '');
  return cleaned.length >= 10 ? cleaned : null;
}

// ── Google Maps Tarama ─────────────────────────────────────────
async function scrapeGoogleMaps(page, query) {
  const results = [];
  const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;

  console.log(`\n🔍 Arıyor: "${query}"`);
  console.log(`   URL: ${searchUrl}`);

  try {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);

    // Cookie/consent dialog varsa kapat
    try {
      const consentBtn = page.locator('button:has-text("Kabul"), button:has-text("Accept"), form[action*="consent"] button');
      if (await consentBtn.first().isVisible({ timeout: 3000 })) {
        await consentBtn.first().click();
        await sleep(2000);
      }
    } catch {
      // Consent dialog yoksa devam
    }

    // Sol paneldeki sonuç listesini bul
    const feedSelector = 'div[role="feed"]';
    try {
      await page.waitForSelector(feedSelector, { timeout: 10000 });
    } catch {
      console.log('   ⚠️ Sonuç listesi bulunamadı, atlanıyor...');
      return results;
    }

    // Listeyi aşağı kaydır
    for (let i = 0; i < CONFIG.scrollCount; i++) {
      await page.evaluate((sel) => {
        const feed = document.querySelector(sel);
        if (feed) feed.scrollTop = feed.scrollHeight;
      }, feedSelector);
      await sleep(2000);

      // "Sonuçların sonu" mesajı kontrolü
      const endReached = await page.evaluate(() => {
        const spans = document.querySelectorAll('span');
        for (const span of spans) {
          if (span.textContent.includes('sonuna ulaştınız') || span.textContent.includes("end of results")) {
            return true;
          }
        }
        return false;
      });
      if (endReached) {
        console.log('   📋 Tüm sonuçlar yüklendi.');
        break;
      }
    }

    // Tüm işletme kartlarını topla
    const items = await page.locator('div[role="feed"] > div > div > a[href*="/maps/place/"]').all();
    console.log(`   📌 ${items.length} sonuç bulundu`);

    for (let i = 0; i < items.length; i++) {
      try {
        // Her bir işletmeye tıkla
        await items[i].click();
        await sleep(2500);

        const data = await page.evaluate(() => {
          const result = {};

          // İsim
          const nameEl = document.querySelector('h1.DUwDvf, h1[class*="header"]');
          result.isim = nameEl ? nameEl.textContent.trim() : null;

          // Adres
          const addressBtn = document.querySelector('button[data-item-id="address"]');
          result.adres = addressBtn ? addressBtn.textContent.trim() : null;

          // Telefon
          const phoneBtn = document.querySelector('button[data-item-id*="phone"]');
          result.telefon = phoneBtn ? phoneBtn.textContent.trim() : null;

          // Puan
          const ratingEl = document.querySelector('div.F7nice span[aria-hidden="true"]');
          result.puan = ratingEl ? parseFloat(ratingEl.textContent.replace(',', '.')) : null;

          // Yorum sayısı
          const reviewEl = document.querySelector('div.F7nice span[aria-label*="yorum"], div.F7nice span[aria-label*="review"]');
          if (reviewEl) {
            const match = reviewEl.textContent.match(/[\d.]+/);
            result.yorum_sayisi = match ? parseInt(match[0].replace('.', '')) : 0;
          } else {
            result.yorum_sayisi = 0;
          }

          // Web sitesi kontrolü
          const websiteBtn = document.querySelector('a[data-item-id="authority"], button[data-item-id="authority"]');
          result.web_sitesi = websiteBtn ? websiteBtn.textContent.trim() : null;

          // Google Maps URL
          result.google_url = window.location.href;

          return result;
        });

        if (data.isim) {
          results.push(data);
        }
      } catch (err) {
        console.log(`   ⚠️ ${i + 1}. sonuç okunamadı: ${err.message}`);
      }
    }
  } catch (err) {
    console.log(`   ❌ Arama hatası: ${err.message}`);
  }

  return results;
}

// ── Ana Fonksiyon ──────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  🗺️  SAKARYA İŞLETME TARAYICI');
  console.log('  📍 Google Maps Scraper');
  console.log('═══════════════════════════════════════════════════');
  console.log(`⏰ Başlama: ${new Date().toLocaleString('tr-TR')}`);
  console.log(`📂 İlçe sayısı: ${CONFIG.ilceler.length}`);
  console.log(`📋 Kategori sayısı: ${CONFIG.kategoriler.length}`);
  console.log(`🔄 Toplam kombinasyon: ${CONFIG.ilceler.length * CONFIG.kategoriler.length}`);
  console.log('───────────────────────────────────────────────────\n');

  const db = initDatabase();

  // Mevcut müşteri veritabanından duplike kontrol için bilgileri yükle
  const existingPhones = new Set(
    db.prepare("SELECT DISTINCT telefon FROM customers WHERE telefon IS NOT NULL AND telefon != ''")
      .all().map(r => r.telefon)
  );
  const existingNames = new Set(
    db.prepare("SELECT isim, ilce FROM customers")
      .all().map(r => (r.isim || '').toLowerCase().trim() + '|' + (r.ilce || '').toLowerCase().trim())
  );
  console.log(`📋 Mevcut kayıtlar: ${existingPhones.size} benzersiz telefon, ${existingNames.size} işletme`);

  // ── Daha önce tamamlanmış taramaları yükle ──────────────────
  // İlk çalıştırmada scan_log boşsa, mevcut customers verisinden geriye dönük doldur
  const scanLogCount = db.prepare('SELECT COUNT(*) as cnt FROM scan_log').get().cnt;
  if (scanLogCount === 0) {
    console.log('📝 scan_log boş, mevcut veriden geriye dönük dolduruluyor...');
    const existingCombos = db.prepare(
      'SELECT DISTINCT ilce, kategori, COUNT(*) as cnt FROM customers GROUP BY ilce, kategori'
    ).all();
    const backfillStmt = db.prepare(
      "INSERT OR IGNORE INTO scan_log (ilce, kategori, sonuc_sayisi) VALUES (?, ?, ?)"
    );
    for (const combo of existingCombos) {
      backfillStmt.run(combo.ilce, combo.kategori, combo.cnt);
    }
    console.log(`   ✅ ${existingCombos.length} tamamlanmış tarama kaydedildi`);
  }

  // Tamamlanmış ilçe+kategori çiftlerini yükle
  const completedScans = new Set(
    db.prepare('SELECT ilce, kategori FROM scan_log').all()
      .map(r => `${r.ilce}|${r.kategori}`)
  );
  console.log(`🏁 Daha önce tamamlanmış tarama: ${completedScans.size} kombinasyon`);

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO customers (isim, kategori, adres, ilce, telefon, puan, yorum_sayisi, google_url, web_sitesi, durum)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let totalFound = 0;
  let totalSaved = 0;
  let totalSkipped = 0;

  let browser;

  try {
    console.log('🚀 Tarayıcı başlatılıyor...');
    browser = await chromium.launch({
      headless: CONFIG.headless,
      args: ['--lang=tr-TR', '--no-sandbox']
    });

    const context = await browser.newContext({
      locale: 'tr-TR',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();
    page.setDefaultTimeout(15000);

    const scanInsertStmt = db.prepare(
      'INSERT OR IGNORE INTO scan_log (ilce, kategori, sonuc_sayisi) VALUES (?, ?, ?)'
    );

    // Toplam kalan tarama hesapla
    let totalRemaining = 0;
    for (const ilce of CONFIG.ilceler) {
      for (const kategori of CONFIG.kategoriler) {
        if (!completedScans.has(`${ilce}|${kategori}`)) totalRemaining++;
      }
    }
    console.log(`📋 Kalan tarama sayısı: ${totalRemaining} / ${CONFIG.ilceler.length * CONFIG.kategoriler.length}`);

    if (totalRemaining === 0) {
      console.log('\n🎉 Tüm ilçe+kategori kombinasyonları zaten taranmış! Yapılacak bir şey yok.');
      return;
    }

    for (const ilce of CONFIG.ilceler) {
      // Bu ilçede taranacak kategori var mı kontrol et
      const remainingInIlce = CONFIG.kategoriler.filter(
        k => !completedScans.has(`${ilce}|${k}`)
      );
      if (remainingInIlce.length === 0) {
        console.log(`\n⏭️  ${ilce} → tüm kategoriler zaten taranmış, atlanıyor`);
        continue;
      }

      console.log(`\n${'━'.repeat(50)}`);
      console.log(`📍 İLÇE: ${ilce} (${remainingInIlce.length} kategori kaldı)`);
      console.log(`${'━'.repeat(50)}`);

      for (const kategori of CONFIG.kategoriler) {
        // Daha önce taranmış kombinasyonu atla
        const scanKey = `${ilce}|${kategori}`;
        if (completedScans.has(scanKey)) {
          console.log(`\n   ⏭️  "${kategori}" → daha önce taranmış, atlanıyor`);
          continue;
        }
        const query = `${kategori} ${ilce}`;

        try {
          const results = await scrapeGoogleMaps(page, query);
          totalFound += results.length;

          for (const item of results) {
            // Web sitesi olanları atla
            if (item.web_sitesi) {
              totalSkipped++;
              console.log(`   ⏭️  ${item.isim} → web sitesi var, atlanıyor`);
              continue;
            }

            const phone = normalizePhone(item.telefon);

            // Duplike kontrol: telefon numarası zaten kayıtlıysa atla
            if (phone && existingPhones.has(phone)) {
              console.log(`   🔄 ${item.isim} → telefon zaten kayıtlı (${phone})`);
              continue;
            }

            // Duplike kontrol: isim + ilçe kombinasyonu zaten varsa atla
            const nameKey = (item.isim || '').toLowerCase().trim() + '|' + (ilce || '').toLowerCase().trim();
            if (existingNames.has(nameKey)) {
              console.log(`   🔄 ${item.isim} → isim+ilçe zaten kayıtlı`);
              continue;
            }

            try {
              insertStmt.run(
                item.isim,
                kategori,
                item.adres || '',
                ilce,
                phone,
                item.puan || 0,
                item.yorum_sayisi || 0,
                item.google_url || '',
                null,
                phone ? 'telefon_var' : 'telefon_yok'
              );
              totalSaved++;
              console.log(`   ✅ ${item.isim} → kaydedildi ${phone ? '📱' : '❌📱'}`);

              // Bellekteki setleri güncelle
              if (phone) existingPhones.add(phone);
              existingNames.add(nameKey);
            } catch (dbErr) {
              if (dbErr.message.includes('UNIQUE')) {
                console.log(`   🔄 ${item.isim} → zaten kayıtlı (URL)`);
              } else {
                console.log(`   ❌ DB hatası: ${dbErr.message}`);
              }
            }
          }

          // Bu ilçe+kategori taraması tamamlandı, kaydet
          scanInsertStmt.run(ilce, kategori, results.length);
          completedScans.add(scanKey);
          console.log(`   📝 Tarama kaydedildi: ${ilce} / ${kategori} (${results.length} sonuç)`);

          // Rate limiting - aramalar arası bekleme
          await randomDelay(3000, 6000);

        } catch (err) {
          console.log(`   ❌ "${query}" tarama hatası: ${err.message}`);
          // Hata durumunda scan_log'a kaydetme — tekrar denenecek
        }
      }
    }

  } catch (err) {
    console.error('❌ Kritik hata:', err.message);
  } finally {
    if (browser) {
      await browser.close();
      console.log('\n🔒 Tarayıcı kapatıldı.');
    }
    db.close();
  }

  // ── Özet ─────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  📊 TARAMA ÖZETİ');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  🔍 Toplam bulunan     : ${totalFound}`);
  console.log(`  ✅ Kaydedilen          : ${totalSaved}`);
  console.log(`  ⏭️  Web sitesi olan     : ${totalSkipped}`);
  console.log(`  ⏰ Bitiş              : ${new Date().toLocaleString('tr-TR')}`);
  console.log('═══════════════════════════════════════════════════');
  console.log('\n💡 Sonraki adım: node data-manager.js');
}

main().catch(console.error);
