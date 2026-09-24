/**
 * QuizTavern ikon seti — tek kaynak.
 *
 * Eskiden her ikon ActivityApp içinde elle yazılmış tek bir <path> idi; çizgi
 * kalınlıkları/oranları tutarsızdı ve "✦ parıltı" gibi yapay zekâ ürünlerinin
 * klişe simgelerini taşıyordu. Artık Phosphor (MIT) kullanılıyor: tek tasarım
 * dili, tek çizgi ağırlığı, bundle'a yalnız kullanılan ikonlar girer (CDN yok,
 * Discord CSP'si ile uyumlu).
 *
 * Kural: küçük arayüz işaretleri `bold`, büyük/karakter ikonları (mod kartları,
 * kategori kartları) `duotone`. Parıltı/sihirli değnek/beyin/orbit gibi "AI"
 * simgeleri bu sette YOK — eklemeyin.
 */
import type { ComponentType } from 'react'
import type { IconProps as PhosphorProps, IconWeight } from '@phosphor-icons/react'
import {
  ArrowRight, Atom, Barbell, Bomb, BookOpenText, Bone, Brain, Buildings, CalendarCheck, Car, CaretDown, Cards,
  ChartLineUp, Check, CoatHanger, Coins, Columns, Cpu, Crown, Detective, Dna, DotsThreeOutline, Eye, FilmSlate, Fire,
  Flag, Flask, FlowerLotus, FlyingSaucer, ForkKnife, GameController, Gear, Ghost, GlobeHemisphereWest, GlobeSimple,
  HandsClapping, Headset, Heart, Heartbeat, Horse, Lightbulb, Lock, MathOperations, Medal, MicrophoneStage, MusicNotes,
  MusicNotesSimple, Palette, PawPrint, Planet, Popcorn, Question, Quotes, Robot, Scroll, ShieldStar, SignOut,
  SlidersHorizontal, Smiley, SoccerBall, SpeakerHigh, SpeakerSlash, Star, StarAndCrescent, Sword, Tag, Television,
  TestTube, TextAa, Translate, Tree, Trophy, UserPlus, UsersThree, Waves, WifiHigh, X,
} from '@phosphor-icons/react'

type Glyph = ComponentType<PhosphorProps>

/** Arayüz ikonları. Anahtarlar anlamsal: "neyi gösterdiği", nasıl göründüğü değil. */
const UI_ICONS = {
  // mod kimlikleri
  cards: Cards,          // Klasik: soru kartı destesi
  fuse: Bomb,            // Fitil: fitili yanan bomba (8 sn)
  letters: TextAa,       // Çember: harf/kelime
  coins: Coins,          // Çifte Bahis: jetonlar
  teams: UsersThree,     // Takım
  more: DotsThreeOutline,
  // genel
  sliders: SlidersHorizontal,
  medal: Medal,
  trophy: Trophy,
  crown: Crown,
  chevron: CaretDown,
  lock: Lock,
  check: Check,
  close: X,
  arrow: ArrowRight,
  people: UsersThree,
  seat: UserPlus,
  exit: SignOut,
  globe: GlobeSimple,
  mic: MicrophoneStage,
  eye: Eye,
  flag: Flag,
  calendar: CalendarCheck,
  question: Question,
  flame: Fire,
  heart: Heart,
  star: Star,
  clap: HandsClapping,
  speaker: SpeakerHigh,
  speakerOff: SpeakerSlash,
  music: MusicNotes,
  musicOff: MusicNotesSimple,
} satisfies Record<string, Glyph>

export type IconName = keyof typeof UI_ICONS

export function Icon({ name, weight = 'bold', className = '' }: { name: IconName; weight?: IconWeight; className?: string }) {
  const Glyph = UI_ICONS[name]
  return <Glyph className={`qt-icon qt-ph ${name === 'eye' ? 'qt-icon--eye' : ''} ${className}`} weight={weight} aria-hidden="true" />
}

/** Kategori kartı ikonları — anahtarlar oyundaki GERÇEK kategori adları. */
const CATEGORY_ICONS: Record<string, Glyph> = {
  'Sinema': FilmSlate,
  'Müzik': MusicNotes,
  'Bilim': Flask,
  'Biyoloji': Dna,
  'Tarih': Scroll,
  'Coğrafya': GlobeHemisphereWest,
  'Matematik': MathOperations,
  'Genel Kültür': Lightbulb,
  'Teknoloji': Cpu,
  'Fizik': Atom,
  'Spor': Barbell,
  'Mitoloji': Sword,
  'Edebiyat': BookOpenText,
  'Dizi/TV': Television,
  'Sanat': Palette,
  'Video Oyunları': GameController,
  'Uzay': Planet,
  'Doğa': Tree,
  'Kimya': TestTube,
  'Felsefe': Columns,
  'Yemek': ForkKnife,
  'Hayvanlar': PawPrint,
  'Anime': FlowerLotus,
  'Çizgi Film': Smiley,
  'Otomobil': Car,
  'Ekonomi': ChartLineUp,
  'Sağlık': Heartbeat,
  'Popüler Kültür': Popcorn,
  'İnternet': WifiHigh,
  'Türkiye': StarAndCrescent,
  'Bilim Kurgu': FlyingSaucer,
  'Moda': CoatHanger,
  'Futbol': SoccerBall,
  'Espor': Headset,
  'Satranç': Horse,
  'Dinozorlar': Bone,
  'Deyimler': Quotes,
  'Ünlüler': Star,
  'Markalar': Tag,
  'Süper Kahramanlar': ShieldStar,
  'Korku': Ghost,
  'Polisiye': Detective,
  'Diller': Translate,
  'Mimari': Buildings,
  'Psikoloji': Brain,
  'İcatlar': Gear,
  'Yapay Zeka': Robot,
  'Okyanuslar': Waves,
}

export function CategoryIcon({ name, weight = 'duotone' }: { name: string; weight?: IconWeight }) {
  const Glyph = CATEGORY_ICONS[name] ?? Question
  return <Glyph className="qt-icon qt-ph" weight={weight} aria-hidden="true" />
}
