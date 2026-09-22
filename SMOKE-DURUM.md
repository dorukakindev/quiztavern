# Smoke testi — canlı durum (bu oturum)

> Bu dosya oturuma özeldir; tünel URL'leri cloudflared her yeniden başladığında
> DEĞİŞİR. Kalıcı rehber: SMOKE-TEST.md

## Açık tüneller

| Ne | Adres | Doğrulama |
|---|---|---|
| İstemci (5173) | `align-closer-figures-lions.trycloudflare.com` | HTTP 200, title: QuizTavern |
| Sunucu (3001) | `examination-console-determination-record.trycloudflare.com` | HTTP 200, `/health` cevap veriyor |

## Portal'a girecek değerler — İKİ eşleme birden

**URL Eşlemeleri** sayfası iki bölüm (protokolsüz — `https://` YAZMA):

**Kök Eşlemeleri** (Önek `/` sabit, sadece Hedef'i doldur):
```
align-closer-figures-lions.trycloudflare.com
```

**Vekil Yol Eşlemeleri** ("Bir URL Eşleştirmesi daha ekle"):

| Önek | Hedef |
|---|---|
| `/api` | `examination-console-determination-record.trycloudflare.com` |

`/api` eksikse token adımı 404 alır (istek köke düşüp Vite'a gider).

`/api` satırı OYUN SUNUCUSU içindir ve zorunludur: Discord'un CSP'si iframe'den
dış adreslere isteği engeller — istemci sunucuya ancak proxy üzerinden
(`xxx.discordsays.com/api/...`) ulaşabilir. Bu satır olmadan oyun Discord'da
"Sunucu bağlantısı kurulamadı" der (ilk denemede tam da bu oldu).

## Doldurulanlar

- `client/.env` → `VITE_DISCORD_CLIENT_ID` (1527404748607721632) + `VITE_GAME_SERVER_URL` ✅
- `server/.env` → `DISCORD_CLIENT_ID` + `SESSION_SECRET` (rastgele üretildi) ✅

## Kullanıcının dolduracakları (`server/.env`)

- `DISCORD_CLIENT_SECRET` — Portal > OAuth2 > Reset Secret
- `DISCORD_BOT_TOKEN` — Portal > Bot > Reset Token

Bunlar girilince **`ALLOW_MOCK_AUTH=1` satırının başına `#` koy** — üretim duruşuna
geçilir, gerçek Discord kimlik doğrulaması devreye girer. Sonra sunucuyu ve
istemciyi yeniden başlat (`.env` değişikliği yeniden başlatma ister).

## Portal kontrol listesi

- [x] Etkinlikleri Etkinleştir (Entry Point komutu otomatik oluştu — dokunma)
- [ ] Ayarlar: Maksimum Katılımcılar **8**
- [ ] Ayarlar: Yaş Sınırı **kapalı**
- [ ] Ayarlar: Telefon + Tablet Yön Kilidi **Yatay**
- [ ] Ayarlar: Desteklenen Platformlar **Web + iOS + Android**
- [ ] Kur (Installation): **User Install + Guild Install** ikisi de
- [ ] URL Eşlemeleri: yukarıdaki istemci adresi
