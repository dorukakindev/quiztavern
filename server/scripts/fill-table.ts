/**
 * Geliştirme aracı: bir odayı N sahte oyuncuyla doldurur ve açık tutar.
 * Yörünge masasını 2-8 oyuncuda gözle/ölçerek denemek için.
 * Kullanım: npx tsx scripts/fill-table.ts <oda> <adet> <saniye>
 */
import { io, type Socket } from "socket.io-client";
import { EV } from "../../shared/types";

const room = process.argv[2] || "orbit8";
const count = Number(process.argv[3] || 7);
const seconds = Number(process.argv[4] || 75);
const names = ["Baran", "Elif", "Deniz", "Ceren", "Efe", "Figen", "Gizem"];
const sockets: Socket[] = [];

for (let i = 0; i < count; i++) {
  const name = names[i] || `Oyuncu${i}`;
  // Port sabit değil: test yığını 3002'de koşuyor, 3001 üretim. Sabit yazınca
  // betik sessizce üretime bağlanıp mock kimlikle reddediliyordu.
  const socket = io(process.env.SERVER_URL || "http://localhost:3001", {
    path: "/socket.io",
    transports: ["websocket"],
    auth: { roomId: room, devId: `as-${name.toLowerCase()}-tab`, devName: name },
  });
  // Hazır de: yalnızca bağlanınca masa "1/5 hazır"da takılıyor ve maç
  // başlatılamıyordu — oyun ekranını kalabalık masayla test etmek imkânsızdı.
  socket.on("connect", () => {
    console.log(`${name} masada`);
    socket.emit(EV.READY, true);
  });
  // Ayar değişince sunucu herkesin hazırını sıfırlar; sahte oyuncular yeniden onaylar.
  socket.on(EV.STATE, (state: { players: { name: string; ready: boolean }[] }) => {
    if (state.players?.some((player) => player.name === name && !player.ready)) socket.emit(EV.READY, true);
  });
  socket.on("connect_error", (error) => console.error(`${name} reddedildi: ${error.message}`));
  sockets.push(socket);
}

setTimeout(() => {
  sockets.forEach((socket) => socket.disconnect());
  process.exit(0);
}, seconds * 1000);
