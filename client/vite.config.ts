import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const additionalAllowedHosts = (process.env.__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS ?? '')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean)

export default defineConfig({
  plugins: [react()],
  server: {
    // Discord smoke testi cloudflared quick tunnel üzerinden gelir; Vite
    // tanımadığı Host başlığını varsayılan olarak reddeder (dev sunucusuna
    // DNS-rebinding koruması). Yalnızca tünel alan adına izin veriyoruz.
    allowedHosts: ['.trycloudflare.com', ...additionalAllowedHosts],
    proxy: {
      '/socket.io': {
        target: 'http://127.0.0.1:3001',
        ws: true,
      },
      '/auth': {
        target: 'http://127.0.0.1:3001',
      },
      // Soru paketi API'si — prod'da Discord proxy'si /api'yi soyup iletir;
      // dev'de vite doğrudan sunucuya taşır.
      '/api': {
        target: 'http://127.0.0.1:3001',
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Nadiren değişen büyük bağımlılıkları ayrı chunk'a al: tarayıcı
        // uzun ömürlü cache'ler, app kodu güncellenince tekrar indirmez.
        manualChunks(id: string) {
          if (id.includes('node_modules/react') || id.includes('node_modules/socket.io-client')) return 'vendor'
        },
      },
    },
  },
})
