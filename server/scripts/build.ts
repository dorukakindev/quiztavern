import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const serverRoot = fileURLToPath(new URL("..", import.meta.url));
const distDir = resolve(serverRoot, "dist");

await rm(distDir, { recursive: true, force: true });
await mkdir(resolve(distDir, "data"), { recursive: true });

await build({
  configFile: false,
  root: serverRoot,
  build: {
    ssr: resolve(serverRoot, "src/index.ts"),
    target: "node22",
    outDir: resolve(distDir, "src"),
    emptyOutDir: false,
    sourcemap: true,
    rollupOptions: {
      output: { entryFileNames: "index.js" },
      external: ["express", "socket.io"],
    },
  },
});

// questions*.ts dosyaları import.meta.url'a göre ../data altından okur;
// production çıktısında aynı ilişkiyi koruyoruz — data/*.json'un tamamı kopyalanır
// (yeni soru dosyaları eklenince imajın eksik dosyayla çökmesini önler).
const dataDir = resolve(serverRoot, "data");
for (const file of await readdir(dataDir)) {
  if (file.endsWith(".json")) await cp(resolve(dataDir, file), resolve(distDir, "data", file));
}
