# Proje Analizi ve Kurulum Rehberi

## 1. Genel Bakış
Bu proje, web sitesi olmayan yerel işletmeleri tespit edip onlara otomatik WhatsApp mesajları göndererek müşteri kazanmayı hedefleyen, Node.js tabanlı bir **CRM ve Otomasyon** sistemidir.

## 2. Sistemin Çalıştırılması

### Gereksinimler
- Node.js (v22+ önerilir, dâhili `node:sqlite` desteği için)
- Paket kurulumları için terminalde proje dizinine giderek aşağıdaki komutların çalıştırılması:
  ```bash
  npm install express dotenv playwright whatsapp-web.js qrcode-terminal multer xlsx country-state-city
  npx playwright install
  ```

### Çalıştırma Adımları
1. **Paneli Başlatın:** Terminalde `node dashboard.js` komutunu çalıştırın. Web sunucusu ayağa kalkacak ve uygulama `http://localhost:3000` adresinden erişilebilir olacaktır.
2. **Kullanım Aşamaları:**
   - Tarayıcınızdan CRM arayüzüne girin.
   - Sağ üstten veya menüden "Harita Tarama" özelliğini başlatarak, arka planda işletme toplama botunu çalıştırın.
   - Yeterli veri toplandıktan sonra "Toplu Mesaj" butonuna basarak gönderim işlemini tetikleyin.
   - Ekrana gelen **WhatsApp QR Kodunu** telefonunuzun "Bağlı Cihazlar" bölümünden taratarak WhatsApp Web oturumunuzu açın. İşlemler otomatik olarak başlayacaktır.

*Not: Sistemdeki `maps-scraper.js` (tarama) ve `message-sender.js` (gönderim) modülleri panelden bağımsız olarak doğrudan terminal üzerinden de (`node maps-scraper.js` şeklinde) çalıştırılabilir.*

---

## 3. Dosya ve Mimari Analizi

### `dashboard.js` (Ana Sunucu ve Kontrol Paneli)
- **İşlevi:** Express.js ile geliştirilmiş web sunucusudur. API rotalarını barındırır ve CRM panelinin HTML/CSS arayüzünü (yaklaşık 2300 satırlık devasa bir yapı halinde) ekrana basar.
- **Yetkinlikleri:** Müşteri ve log istatistiklerini hesaplama, SQLite veritabanına veri yazıp okuma, sisteme Excel üzerinden manuel numara ekleme işlemleri gibi birçok Backend yükünü üstlenir. 
- **Modül Yönetimi:** Scraper ve Sender işlemlerini Node.js `child_process.spawn` kütüphanesiyle alt süreç (background process) olarak başlatıp durdurabilir.

### `maps-scraper.js` (Veri Toplama Botu)
- **İşlevi:** Playwright (headless browser) yardımıyla Google Haritalar'ı açıp, konfigürasyondaki ilçe/kategori eşleşmelerini ("Adapazarı Güzellik Salonu" vb.) sırayla aratır.
- **Algoritması:** Yüklenen sayfalardaki işletme kartlarını okur, isim, adres, puan ve **web sitesi durumunu** analiz eder. Eğer web sitesi yoksa bu işletmeyi potansiyel müşteri olarak `customers.db` SQLite veritabanına kaydeder. Aynı ilçe/isim veya telefon varsa tekrarlanan kayıtları otomatik pas geçer.

### `message-sender.js` (WhatsApp Botu)
- **İşlevi:** `whatsapp-web.js` kullanarak (Puppeteer tabanlı), `customers.db` içerisinde biriktirilen web sitesi olmayan işletmelere kategorilerine özel ("Kuaförlere özel web sitesi..." vb.) satış mesajları gönderir.
- **Güvenlik & Loglama:** 
  - WhatsApp spam filtrelerine takılmamak adına mesajlar arasına rastgele gecikmeler (30-90 saniye) koyar.
  - Günlük (maxDailyMessages) mesaj limitine uyar.
  - Gönderilen veya hata veren mesajları `messages_log.db` veritabanına kaydeder.

### `frontend.js` (Kullanıcı Arayüzü Mantığı)
- **İşlevi:** Sayfalar arası geçiş, tablo verilerini ve istatistik panolarını çekip ekranda gösterme (AJAX istekleri), filtreleme mekanizması (kategori/durum) gibi tarayıcı tarafı (client-side) operasyonları yürütür. Arayüz animasyonları ve bildirim (toast) gibi işlevler de buradadır.

---

## 4. Tespit Edilen Sorunlar ve İyileştirme Önerileri

1. **Senkron Veritabanı Engeli (Event Loop Blocking):**
   - **Risk:** Projede `node:sqlite`'in senkron (DatabaseSync) yapısı kullanılıyor. `maps-scraper.js` veya `message-sender.js` gibi kendi halinde çalışan betiklerde bu sorun yaratmasa da, `dashboard.js` (Express sunucusu) tarafında senkron sorgu yapmak, API'ye her istek geldiğinde sunucunun kilitlenmesi (block) anlamına gelir. 
   - **Çözüm:** Express API'lerinde asenkron çalışabilen bir veritabanı sürücüsüne geçilmesi (örn: asenkron çalışan `sqlite3`) veya çok hızlı olduğu için bloklama süresini minimize eden `better-sqlite3` yapısının kullanılması performans açısından elzemdir.

2. **Spaghetti Kod ve UI/Backend Birleşimi:**
   - **Risk:** `dashboard.js` içerisinde hem sunucu yapılandırması hem API rotaları hem de binlerce satırlık HTML/CSS kodu bir arada. Bu "Separation of Concerns" (Sorumlulukların Ayrılığı) prensibine tamamen aykırıdır. Kodun bakımını ve geliştirilmesini aşırı zorlaştırır.
   - **Çözüm:** Arayüz kodları (HTML, CSS) `public/` veya `views/` klasörlerine ayrılmalı. `dashboard.js` yalnızca API rotalarını sunmalı ve UI kısımlarını `express.static` veya bir template engine (EJS vb.) ile dışarıdan servis etmelidir.

3. **Gizli Bağımlılık Riski (`send-custom.js`):**
   - **Risk:** Kullanıcı arayüzden özel bir mesaj ("Müşteriye Fiyat Bilgisi Gönder") tetiklediğinde, `dashboard.js` içerisinde `send-custom.js` adında ayrı bir bot ayağa kaldırılmaya çalışılıyor (`spawn('node', ['send-custom.js'...])`). Sistemin bütünlüğünde bu dosyanın bulunup bulunmadığı kritik öneme sahip. Dosya eksikse özel mesajlar fail edecektir.

4. **Veritabanı Konfigürasyonlarının Tekrarı:**
   - **Risk:** `customers.db` ve `messages_log.db` veritabanlarını başlatan ve şemaları yükleyen fonksiyonlar (`initDatabase`, `getCustomersDb`, vs.) farklı dosyalarda birbirini tekrar ediyor.
   - **Çözüm:** Ortak bir `db.js` modülü yaratılıp veritabanı bağlantısı tüm sisteme oradan "export" edilmelidir. Böylece tek bir yerden yönetilebilir.
