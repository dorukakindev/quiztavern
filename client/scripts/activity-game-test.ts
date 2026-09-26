import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import {
  betOptionSpecs,
  bothTeamsPresent,
  circleAnswerIsLocked,
  circleInputShouldFocus,
  nextMenuIndex,
  questionIsLocked,
  shortcutIndex,
} from "../src/activity/gameLogic";
import { isAuthRequiredError } from "../src/lib/realtime";

let passed = 0;
const test = (name: string, run: () => void) => {
  run();
  passed += 1;
  console.log(`  ✓ ${name}`);
};

console.log("Activity oyun/erişilebilirlik regresyonları");
const activitySource = readFileSync(new URL("../src/activity/ActivityApp.tsx", import.meta.url), "utf8");
const activityCss = readFileSync(new URL("../src/activity/activity.css", import.meta.url), "utf8");
const realtimeSource = readFileSync(new URL("../src/lib/realtime.ts", import.meta.url), "utf8");
const i18nSource = readFileSync(new URL("../src/activity/i18n.ts", import.meta.url), "utf8");
const bridgeSource = readFileSync(new URL("../src/activity/sdkBridge.ts", import.meta.url), "utf8");
const polishCss = readFileSync(new URL("../src/activity/polish.css", import.meta.url), "utf8");
const roomsSource = readFileSync(new URL("../../server/src/rooms.ts", import.meta.url), "utf8");

test("sıfır bakiyede yalnız asgari (0) çipi görünür", () => {
  assert.deepEqual(betOptionSpecs(0), [{ key: "min", amount: 0 }]);
});

test("yuvarlama aynı tutarı üretince bahis seçenekleri tekilleşir", () => {
  // Çarpışmada daha anlamlı anahtar korunur: all > half > quarter > min.
  assert.deepEqual(betOptionSpecs(1), [{ key: "all", amount: 1 }]);
  assert.deepEqual(betOptionSpecs(2), [
    { key: "half", amount: 1 },
    { key: "all", amount: 2 },
  ]);
  assert.deepEqual(betOptionSpecs(3), [
    { key: "quarter", amount: 1 },
    { key: "half", amount: 2 },
    { key: "all", amount: 3 },
  ]);
});

test("normal bakiyede Asgari/Çeyrek/Yarı/Hepsi korunur", () => {
  assert.deepEqual(
    betOptionSpecs(1000).map((option) => option.amount),
    [100, 250, 500, 1000],
  );
});

test("bahis A/B/C/D kısayolları görünür seçeneklere eşlenir", () => {
  assert.equal(shortcutIndex("a", 4), 0);
  assert.equal(shortcutIndex("D", 4), 3);
  assert.equal(shortcutIndex("D", 2), null);
});

test("1-4 rakam kısayolları harflerle aynı şıkka eşlenir", () => {
  assert.equal(shortcutIndex("1", 4), 0);
  assert.equal(shortcutIndex("4", 4), 3);
  assert.equal(shortcutIndex("5", 4), null);
  assert.equal(shortcutIndex("2", 2), 1);
  assert.equal(shortcutIndex("3", 2), null);
  // Klasik şık handler'ı da aynı yardımcıyı kullanır (A-D/1-4 birlikte).
  assert.match(activitySource, /shortcutIndex\(event\.key, 4\)/);
});

test("reveal kararları renkten bağımsız ✓/✗ rozeti + desenle işaretlenir", () => {
  // Renk körlüğü: doğru/yanlış artık yalnız yeşil/kırmızıyla anlatılmıyor —
  // sabit 24px slotta ✓/✗ rozeti ve yanlışta kesikli kenarlık var.
  assert.match(activitySource, /qt-verdict-pop is-right/);
  assert.match(activitySource, /qt-verdict-pop is-wrong/);
  assert.match(activityCss, /\.qt-verdict-pop\.is-right \{[^}]*background: #5ee6c1/);
  assert.match(activityCss, /\.qt-verdict-pop\.is-wrong \{[^}]*background: #ef8674/);
  assert.match(activityCss, /\.qt-answer\.is-wrong \{[^}]*border-style: dashed/);
});

test("kategori modalı seçilileri en başta listeler", () => {
  assert.match(activitySource, /const ordered = q\s*\?\s*filtered\s*:\s*\[\.\.\.filtered\]\.sort/);
  assert.match(activitySource, /\{ordered\.map\(\(category\)/);
});

test("bekleyen oyuncunun klasik/takım sorusu kilitlidir", () => {
  assert.equal(questionIsLocked({ selected: null, revealing: false, spectator: false, waiting: true }), true);
  assert.equal(questionIsLocked({ selected: null, revealing: false, spectator: false, waiting: false }), false);
});

test("bekleyen oyuncunun Çember girişi ve Enter gönderimi kilitlidir", () => {
  assert.equal(circleAnswerIsLocked({ answered: false, revealing: false, spectator: false, waiting: true }), true);
  assert.equal(circleAnswerIsLocked({ answered: false, revealing: false, spectator: false, waiting: false }), false);
  assert.match(activitySource, /disabled=\{circleLocked\}/);
  assert.match(activitySource, /event\.key === ["']Enter["'].*!circleLocked/);
  assert.match(activitySource, /waiting \?\s*\(\s*t\(["']game\.waitingNextRound["']/);
});

test("Çember inputu yeni ve oynanabilir turda odağı alır", () => {
  assert.equal(circleInputShouldFocus({ hasPrompt: true, locked: false }), true);
  assert.equal(circleInputShouldFocus({ hasPrompt: true, locked: true }), false);
  assert.equal(circleInputShouldFocus({ hasPrompt: false, locked: false }), false);
  assert.match(activitySource, /circleInputRef\.current\?\.focus\(\)/);
});

test("Takım başlangıcı iki bağlı takım gerektirir", () => {
  assert.equal(
    bothTeamsPresent("team", [
      { connected: true, team: 0 },
      { connected: true, team: 0 },
    ]),
    false,
  );
  assert.equal(
    bothTeamsPresent("team", [
      { connected: true, team: 0 },
      { connected: true, team: 1 },
    ]),
    true,
  );
  assert.equal(bothTeamsPresent("classic", [{ connected: true, team: 0 }]), true);
});

test("menü ok/Home/End gezinmesi sarar", () => {
  assert.equal(nextMenuIndex(0, "ArrowUp", 3), 2);
  assert.equal(nextMenuIndex(-1, "ArrowDown", 3), 0);
  assert.equal(nextMenuIndex(2, "ArrowDown", 3), 0);
  assert.equal(nextMenuIndex(1, "Home", 3), 0);
  assert.equal(nextMenuIndex(1, "End", 3), 2);
});

test("host menüsü ilk öğeye odaklanır ve odağı tetikleyiciye döndürür", () => {
  assert.match(activitySource, /querySelector<HTMLButtonElement>\(["']\[role="menuitem"\]["']\)\?\.focus\(\)/);
  assert.match(activitySource, /trigger\.isConnected\) trigger\.focus\(\)/);
});

test("auth yenileme kodu ve reconnect odak tuzağı bağlıdır", () => {
  assert.equal(isAuthRequiredError({ data: { code: "AUTH_REQUIRED" } }), true);
  assert.equal(isAuthRequiredError(new Error("normal bağlantı hatası")), false);
  assert.match(activitySource, /useFocusTrap<HTMLDivElement>\(true\)/);
  assert.match(activitySource, /aria-labelledby="qt-reconnect-title"/);
});

test("soru ve lobi hareket imzaları bağlıdır", () => {
  assert.match(activitySource, /const BEAT_CARDS_MS = 200/);
  assert.match(activitySource, /aria-pressed=\{selected === index\}/);
  assert.match(activitySource, /className="qt-score-flight"/);
  assert.match(activitySource, /className="qt-sr-only"/);
  assert.match(activitySource, /["']--timer-angle["']: `\$\{1 - visibleRatio\}turn`/);
  assert.doesNotMatch(activityCss, /var\(--letter-i\)/);
  assert.match(activitySource, /<ModeTableScene mode=\{mode\}/);
  assert.match(activitySource, /justJoined\[seat\] \? ["']is-joining["']/);
  assert.match(activityCss, /@keyframes qtScoreFlight/);
  assert.match(activityCss, /@keyframes qtSeatSit/);
});

test("yerel socket aynı origin ve taşıma fallbackini kullanır", () => {
  assert.match(realtimeSource, /VITE_GAME_SERVER_URL \|\| window\.location\.origin/);
  assert.match(realtimeSource, /transports: \[["']polling["'], ["']websocket["']\]/);
  assert.match(realtimeSource, /tryAllTransports: true/);
});

test("dar ekran katmanlari icerigi kapatmaz", () => {
  assert.match(activitySource, /const showSpectatorBar =/);
  assert.match(activitySource, /showSpectatorBar \? ["']has-spectator-bar["'] : ["']["']/);
  assert.match(activityCss, /\.qt-spectator-bar \{[^}]*translate: -50% 0;/);
  assert.match(activityCss, /\.qt-activity-root\.has-spectator-bar > \.qt-activity \{\s*padding-bottom:/);
  assert.match(activityCss, /\.qt-mode-list \{[^}]*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(activityCss, /\.qt-difficulty-row \{\s*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);\s*\}/);
  assert.match(
    activityCss,
    /@media \(max-width: 560px\) and \(orientation: portrait\)[\s\S]*?\.qt-game \{[^}]*calc\(86px \+ var\(--qt-saib\)\)/,
  );
  assert.match(activityCss, /\.qt-question-image \{\s*max-width: min\(100%, 210px\);\s*max-height: 140px;\s*\}/);
});

test("socket offline iken iskelet yerine hata ekranı ve reconnectNow çıkar", () => {
  // Gerçek Discord gözlemi: socket io.use reddedince istemci sonsuz iskelette
  // kalıyordu. Artık offline + state'siz durumda hata ekranı gösterilmeli ve
  // OAuth'u baştan kurmayan socket yeniden bağlantısı kullanılmalı.
  assert.match(activitySource, /game\.status === ["']offline["']/);
  assert.match(activitySource, /i18n\.t\(["']boot\.unreachable["']\)/);
  assert.match(activitySource, /onClick=\{game\.reconnectNow\}/);
  assert.match(realtimeSource, /connectionError/);
  assert.match(realtimeSource, /data\?\.code === ["']string["']/);
  assert.match(realtimeSource, /reconnectNow:[\s\S]*?socket\.connect\(\)/);
});

test("özel soru paketi: SET_PACK emit + lobi seçici + yükleme formu bağlıdır", () => {
  // FAZ 4.4 — masa ayarı socket'e bağlı, liste /api/question-packs'ten çekilir.
  assert.match(realtimeSource, /setPack: \(packId: string \| null\)[\s\S]*?EV\.SET_PACK, \{ packId \}\)/);
  assert.match(activitySource, /onSetPack=\{game\.setPack\}/);
  assert.match(activitySource, /state\?\.pack\?\.id === pack\.id/);
  assert.match(activitySource, /PackUploadForm/);
  assert.match(activitySource, /t\(["']pack\.label["']\)/);
  assert.match(activityCss, /\.qt-pack-form \{\s*display: grid;\s*gap: 8px;/);
  assert.match(i18nSource, /["']pack\.pasteCsv["']:/);
  assert.match(i18nSource, /["']err\.packHostOnly["']:/);
});

test("günlük meydan okuma: lobide buton + podyumda kopyalanabilir desen", () => {
  // Host başlat panelinde ikincil buton → START { daily: true } yayımı.
  assert.match(activitySource, /className="qt-button qt-daily-start"/);
  assert.match(activitySource, /onStartDaily=\{game\.startDaily\}/);
  assert.match(realtimeSource, /startDaily:[\s\S]*?EV\.START, \{ daily: true \}/);
  // Podyum özeti: state.daily.pattern varsa DailyShare render edilir.
  assert.match(activitySource, /state\.daily\?\.pattern && <DailyShare/);
  assert.match(activitySource, /navigator\.clipboard\.writeText\(text\)/);
  // Pano izni yoksa fallback: metin input'u seçilir (elle kopyalanır).
  assert.match(activitySource, /textRef\.current\?\.select\(\)/);
  assert.match(activityCss, /\.qt-daily-share \{/);
  assert.match(activityCss, /\.qt-daily-start \{/);
});

test('podyum "Kanala paylaş": shareLink sonuç kartı + davet fallback', () => {
  // Buton yalnız Discord içinde ve kazanan varken görünür; metin i18n'den.
  assert.match(activitySource, /winner && \(\s*<button\s+className="qt-button qt-podium-share"/);
  assert.match(activitySource, /onShare\(\s*t\(["']share\.message["']/);
  assert.match(bridgeSource, /shareLink\(\{ message \}\)/);
  // shareLink reddedilirse davet diyaloğuna düşülür; ikisi de yoksa false.
  assert.match(bridgeSource, /openInviteDialog/);
  assert.match(activityCss, /\.qt-podium-share \{/);
});

test('"bu soru hatalı" bayrağı yalnız reveal\'da ve klasik modda görünür', () => {
  // Buton tetik koşulu: reveal aktif + çember değil; tur başına tek tıklama.
  assert.match(activitySource, /className="qt-report-flag"[\s\S]*?disabled=\{reported\}/);
  assert.match(activitySource, /beats\.active && !isCircle/);
  assert.match(realtimeSource, /socket\.emit\(EV\.QUESTION_REPORT/);
  assert.match(activityCss, /\.qt-report-flag \{/);
  // Çember'de soru kavramı yok — buton o modda hiç render edilmez.
});

test("cevap bekleyen oyuncu kartı soru/bahis fazında pulse alır", () => {
  assert.match(activitySource, /["']is-awaiting["'] : ["']["']/);
  assert.match(
    activitySource,
    /state\.phase === ["']question["'] \|\| state\.phase === ["']bet["']\) && !player\.answered/,
  );
  assert.match(activityCss, /\.qt-player-card\.is-awaiting \{\s*animation: qtAwaitPulse/);
  assert.match(activityCss, /@keyframes qtAwaitPulse/);
  // Kilitleyen kart pulse'ı bırakıp is-locked sabit görünüme geçer.
  assert.match(activitySource, /player\.answered \? ["']is-locked["'] : ["']["']/);
});

test("faz geçişleri ortak giriş animasyonunu paylaşır ve reduced-motion kapsar", () => {
  assert.match(activityCss, /\.qt-lobby-shell,\s*\.qt-start-countdown,\s*\.qt-game-grid \{\s*animation: qtFadeIn/);
  // Yeni animasyonlar prefers-reduced-motion altında anlık geçişe döner.
  assert.match(
    activityCss,
    /prefers-reduced-motion: reduce[\s\S]*?\.qt-player-card\.is-awaiting[\s\S]*?\.qt-game-grid \{\s*animation: none !important;\s*\}/,
  );
});

test("lig çerçevesi progress.league'e bağlı: avatar, koltuk, podyum + reduced-motion", () => {
  // Avatar bileşeni lig çerçevesini progress.league'den üretir.
  assert.match(activitySource, /player\.progress\?\.league/);
  assert.match(activitySource, /is-frame-\$\{frame\}/);
  // Lobi koltuğu da aynı kaynağı kullanır.
  assert.match(
    activitySource,
    /qt-seat__token \$\{player\.progress\?\.league \? `is-frame-\$\{player\.progress\.league\}`/,
  );
  // Podyum satırları/kazananı PodiumEntry.league üzerinden işaretlenir.
  assert.match(activitySource, /qt-winner--\$\{winner\.league\}/);
  assert.match(activitySource, /is-frame-\$\{player\.league\}/);
  // Tüm lig renkleri çerçeve değişkenine eşlenir + efsane nabzı.
  assert.match(activityCss, /\.qt-avatar\.is-frame-efsane[\s\S]*?--frame-c: #c99df5/);
  assert.match(activityCss, /@keyframes qtFramePulse/);
  assert.match(activityCss, /@keyframes qtWinnerRing/);
  // Reduced-motion: sonsuz çerçeve nabzı durur, kazanan halkası sabit kalır.
  assert.match(
    activityCss,
    /prefers-reduced-motion: reduce[\s\S]*?\.qt-avatar\.is-frame-efsane[\s\S]*?animation: none !important/,
  );
  // Kazanılmamış oyuncu çerçevesizdir — koşul `progress?.league` varlığına bağlı.
  assert.match(activitySource, /frame \? `is-frame-\$\{frame\}` : ["']["']/);
});

test("reveal trivia notu: fact alanı doğru cevabın altında, dile göre gösterilir", () => {
  // Sunucu reveal yüküne fact/factEn ekler; istemci reveal'da satırı basar.
  assert.match(roomsSource, /fact: question\.fact, factEn: question\.factEn/);
  assert.match(activitySource, /state\.reveal\?\.fact/);
  assert.match(activitySource, /state\.reveal\.factEn \? state\.reveal\.factEn : state\.reveal\.fact/);
  assert.match(activitySource, /qt-reveal-fact/);
  assert.match(polishCss, /\.qt-reveal-fact \{/);
  assert.match(i18nSource, /["']reveal\.factTitle["']: ["']Biliyor muydun\?["']/);
  assert.match(i18nSource, /["']reveal\.factTitle["']: ["']Did you know\?["']/);
  // fact yalnızca reveal'da görünür — soru fazında cevap sızıntısı olmaz.
  assert.match(activitySource, /beats\.active && state\.reveal\?\.fact/);
});

console.log(`\n[activity] sonuç: ${passed} geçti, 0 kaldı`);
