# \_legacy — Discord Activity öncesi standalone web arayüzü

Bu klasör, projenin **Discord Activity'ye geçmeden önceki** bağımsız web
uygulamasının koddur. Artık build'e girmiyor: `client/index.html` yalnızca
`/src/activity-main.tsx`'i çağırıyor, buradaki hiçbir dosya oradan erişilmiyor.

Silmek yerine, ileride standalone web app'e geri dönülmek istenirse diye
saklandı.

## İçindekiler

| Dosya | Ne |
|---|---|
| `main.tsx` | Eski giriş noktası. Tüm ekranlar (Home, Lobbies, Modes, Play, Reveal, Finish, Tasks, Tournament, HowTo, Profile, Collection, Leaderboard…) bu tek dosyanın içinde inline. |
| `styles.css` | Eski arayüzün ana stil dosyası. |
| `styles/safety-motion.css` | Hareket/erişilebilirlik stilleri. |
| `components/WordRoute.tsx` | Çember (kelime) modu bileşeni. Activity tarafı bunu KULLANMIYOR. |
| `assets/` | Eski arayüzün PNG görselleri. Canlı Activity kodu buradan hiçbir şey import etmez (Activity görselleri `client/public/assets/discord-activity/*.webp` public yolundan gelir). |

## Build'den nasıl dışlanıyor?

- **Vite:** Buraya kimse import etmediği için bundle'a hiç girmez.
- **TypeScript:** `client/tsconfig.json` içinde `"exclude": ["src/_legacy"]` var —
  yoksa `tsc -b` buradaki (kasıtlı olarak bozulmamış) göreli import'ları tip-kontrol
  edip kırılırdı.

## Paylaşılan modüller (burada DEĞİL)

Eski `main.tsx` bunlara da bağlıydı ama Activity tarafı da kullandığı için
taşınmadılar; canlı ağaçta kalmaya devam ediyorlar:
`activity/i18n`, `lib/realtime`, `lib/sfx`, `shared/types`.

## Geri getirmek (standalone web app'e dönüş)

Dosyalar taşınırken göreli yapı korundu; `src/`'ye geri taşınınca import'lar aynen
çözülür. Repo kökünden:

```sh
git mv client/src/_legacy/main.tsx     client/src/main.tsx
git mv client/src/_legacy/styles.css   client/src/styles.css
git mv client/src/_legacy/styles       client/src/styles
git mv client/src/_legacy/components    client/src/components
git mv client/src/_legacy/assets        client/src/assets
```

Ardından:

1. `client/tsconfig.json`'daki `"exclude": ["src/_legacy"]` satırını kaldır.
2. `client/index.html`'deki `<script src="/src/activity-main.tsx">`'i
   `/src/main.tsx`'e çevir (ya da iki giriş noktasını birlikte yönet).
3. `cd client && npm run build` ile doğrula.
