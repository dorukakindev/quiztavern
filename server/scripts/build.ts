import { cp, mkdir, rm } from "node:fs/promises";
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

// questions.ts dosyayı import.meta.url'a göre okur; production çıktısında da
// aynı ../data ilişkisini bilinçli olarak koruyoruz.
await cp(resolve(serverRoot, "data/questions.json"), resolve(distDir, "data/questions.json"));
