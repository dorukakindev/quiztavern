import pino from "pino";

// Yapılandırılmış tek logger — JSON satırları stdout'a gider (container/PM2
// toplaması için hazır). LOG_LEVEL ile seviye ayarlanır.
export const log = pino({
  level: process.env.LOG_LEVEL ?? "info",
});
