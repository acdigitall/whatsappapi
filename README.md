# 🗺️ Sakarya İşletme Otomasyon Sistemi

Sakarya ilinde web sitesi olmayan işletmeleri Google Maps'ten bulup, WhatsApp üzerinden otomatik mesaj gönderen tam otomatik bir sistem.

## 📋 Sistem Bileşenleri

| Dosya | Açıklama |
|-------|----------|
| `maps-scraper.js` | Google Maps'ten veri çeker |
| `data-manager.js` | Müşteri havuzunu yönetir, skorlar |
| `message-sender.js` | WhatsApp mesajlarını gönderir |
| `dashboard.js` | Web izleme paneli (port 3000) |

## 🚀 Kurulum

### 1. Bağımlılıkları yükle

```bash
npm install
```

### 2. Playwright tarayıcısını yükle

```bash
npx playwright install chromium
```

### 3. Ortam değişkenlerini ayarla (opsiyonel)

`.env` dosyası zaten oluşturulmuş durumda. Değişiklik yapmak isterseniz:

```env
PORT=3000
MAX_DAILY_MESSAGES=50
DELAY_MIN=30
DELAY_MAX=90
HEADLESS=true
SCROLL_COUNT=5
```

## ▶️ Kullanım

### Adım 1: Google Maps Tarama
```bash
node maps-scraper.js
```
Sakarya'nın tüm ilçelerinde 15 farklı kategoride web sitesi olmayan işletmeleri tarar ve `customers.db`'ye kaydeder.

### Adım 2: Veri Analizi ve Export
```bash
node data-manager.js
```
Öncelik skorlarını hesaplar, CSV dosyalarını oluşturur ve konsola özet tablo gösterir.

### Adım 3: WhatsApp Mesaj Gönderimi
```bash
node message-sender.js
```
Terminal'de QR kodu gösterilir. Telefonunuzla tarayın ve mesaj gönderimi otomatik başlar.

### Adım 4: Dashboard
```bash
node dashboard.js
```
http://localhost:3000 adresinden izleme paneline erişin.

## 📊 Öncelik Skoru Hesaplama

| Kriter | Puan |
|--------|------|
| Telefon numarası var | +30 |
| 20'den fazla yorum | +20 |
| 4'ten yüksek puan | +15 |
| 3-4 arası puan | +5 |
| 50'den fazla yorum | +10 |
| 100'den fazla yorum | +5 |

**Maksimum skor: 80**

## 📱 Mesaj Gönderim Kuralları

- Günde maksimum **50 mesaj** (`.env`'den ayarlanabilir)
- Mesajlar arası **30-90 saniye** rastgele bekleme
- Daha önce mesaj gönderilenlere **tekrar gönderilmez**
- WhatsApp'ta kayıtlı olmayan numaralar **atlanır**
- Her kategori için **kişiselleştirilmiş mesaj** şablonları

## 🔧 API Endpoints

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| GET | `/api/stats` | Genel istatistikler |
| GET | `/api/customers` | Müşteri listesi (filtreleme destekli) |
| GET | `/api/messages` | Mesaj gönderim logları |
| POST | `/api/send-messages` | Mesaj gönderimini başlat |

### Filtreleme Parametreleri (`/api/customers`)
- `kategori` - Kategori filtresi
- `ilce` - İlçe filtresi
- `durum` - Durum filtresi (yeni, telefon_var, telefon_yok, mesaj_gonderildi)
- `search` - İsim/adres/telefon araması
- `sort` - Sıralama (oncelik, puan, yorum, isim, tarih)
- `limit` - Sayfa boyutu (max 500)
- `offset` - Başlangıç kayıt

## 📁 Proje Yapısı

```
otomasyon/
├── maps-scraper.js      # Google Maps scraper
├── data-manager.js      # Veri yönetimi
├── message-sender.js    # WhatsApp mesaj gönderici
├── dashboard.js         # Web izleme paneli
├── package.json         # Bağımlılıklar
├── .env                 # Konfigürasyon
├── .gitignore
├── README.md
├── customers.db         # (otomatik oluşur) Müşteri veritabanı
├── messages_log.db      # (otomatik oluşur) Mesaj logları
└── exports/             # (otomatik oluşur)
    ├── tum_musteriler.csv
    └── yuksek_oncelikli.csv
```

## ⚠️ Önemli Notlar

1. **Google Maps taraması** zaman alabilir (~240 arama). `HEADLESS=false` yaparak tarayıcıyı görebilirsiniz.
2. **WhatsApp hesabınızın** yasaklanmaması için günlük mesaj limitini aşmayın.
3. İlk çalıştırmada `npx playwright install chromium` komutunu çalıştırmayı unutmayın.
4. WhatsApp bağlantısı ilk seferde QR kod ister, sonraki seferlerde otomatik bağlanır (`.wwebjs_auth/` klasöründe saklanır).

## 📜 Lisans

Bu proje kişisel kullanım amaçlıdır. Google Maps ve WhatsApp kullanım koşullarına uygun şekilde kullanınız.
