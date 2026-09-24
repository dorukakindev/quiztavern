import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ActivityApp } from './activity/ActivityApp'
// Eski (Activity dışı) arayüz yalnızca Türkçe; sunucudan gelen anahtarı TR sözlükten okur.
import { translate } from './activity/i18n'
import './styles.css'
import './styles/safety-motion.css'
import heroImage from './assets/hero-category-universe-v3.png'
import homeCosmicBackground from './assets/home-cosmic-background.png'
import cinemaCard from './assets/daily-category-cinema.png'
import streakCard from './assets/streak-four-wins.png'
import appLogo from './assets/quiztavern-logo.png'
import tasksBanner from './assets/tasks-space-background.png'
import tournamentCosmicArena from './assets/tournament-bracket-arena.png'
import profileMedallion from './assets/profile-champion-medallion.png'
import howToBanner from './assets/how-to-play-journey.png'
import categoryPack from './assets/category-pack.png'
import lobbyBanner from './assets/lobby-arena-banner-v2.png'
import modeClassicBackground from './assets/mode-classic-bg.png'
import modeFitilBackground from './assets/mode-fitil-bg.png'
import modeCircleBackground from './assets/mode-circle-bg.png'
import profileEmblem from './assets/profile-emblem.png'
import profileAchievements from './assets/profile-achievements.png'
import leaderboardHero from './assets/leaderboard-league-hero.png'
import { useRealtimeGame } from './lib/realtime'
import { WordRoute } from './components/WordRoute'
import type { GameState } from '../../shared/types'

type Screen = 'home' | 'lobbies' | 'modes' | 'play' | 'reveal' | 'finish' | 'history' | 'social' | 'tasks' | 'tournament' | 'howto' | 'profile' | 'leaderboard' | 'collection' | 'wordroute'
type NavIconKind = 'home' | 'lobbies' | 'modes' | 'tasks' | 'tournament' | 'howto' | 'leaderboard' | 'profile' | 'settings'

const categories = [
  ['⚛', 'Bilim', 'mint'], ['◒', 'Felsefe', 'lavender'], ['⌛', 'Tarih', 'amber'],
  ['▣', 'Sinema', 'blue'], ['�?', 'Coğrafya', 'sky'], ['♫', 'Müzik', 'pink'], ['◈', 'Sanat', 'gold'],
]
const players = [['S', 'Sen', 'lavender', '2.450'], ['B', 'Baran', 'amber', '2.320'], ['E', 'Elif', 'mint', '2.100'], ['K', 'Kaan', 'rust', '1.870'], ['Z', 'Zeynep', 'gold', '1.540']]

type QuizQuestion = { category: string; prompt: string; answers: [string, string, string, string]; correct: string }

const questionBank: QuizQuestion[] = [
  { category: 'Sinema', prompt: 'Oscar tarihinde En İyi Film ödülünü kazanan ilk yabancı dilde film hangisidir?', answers: ['Roma', 'Parazit', 'Amour', 'Hayat Güzeldir'], correct: 'B' },
  { category: 'Sinema', prompt: 'The Godfather filminin yönetmeni kimdir?', answers: ['Martin Scorsese', 'Francis Ford Coppola', 'Stanley Kubrick', 'Ridley Scott'], correct: 'B' },
  { category: 'Bilim', prompt: 'Atomun çekirdeğinde hangi iki temel parçacık bulunur?', answers: ['Elektron ve foton', 'Proton ve nötron', 'Atom ve molekül', 'Nötron ve iyon'], correct: 'B' },
  { category: 'Bilim', prompt: 'Dünyanın Güneş etrafındaki bir tam turu yaklaşık kaç gün sürer?', answers: ['180', '365', '500', '730'], correct: 'B' },
  { category: 'Tarih', prompt: 'İstanbul hangi yıl Osmanlı Devleti tarafından fethedildi?', answers: ['1071', '1299', '1453', '1923'], correct: 'C' },
  { category: 'Müzik', prompt: 'Dört Mevsim eserinin bestecisi kimdir?', answers: ['Vivaldi', 'Mozart', 'Bach', 'Beethoven'], correct: 'A' },
  { category: 'Coğrafya', prompt: 'Dünyanın yüzölçümü en büyük okyanusu hangisidir?', answers: ['Atlas', 'Hint', 'Pasifik', 'Arktik'], correct: 'C' },
  { category: 'Matematik', prompt: 'Bir üçgenin iç açıları toplamı kaç derecedir?', answers: ['90', '180', '270', '360'], correct: 'B' },
  { category: 'Fizik', prompt: 'Işık boşlukta yaklaşık hangi hızla ilerler?', answers: ['30 bin km/s', '300 bin km/s', '3 milyon km/s', 'Ses hızı'], correct: 'B' },
  { category: 'Biyoloji', prompt: 'Fotosentez sonucunda atmosferde hangi gaz artar?', answers: ['Azot', 'Karbondioksit', 'Oksijen', 'Hidrojen'], correct: 'C' },
  { category: 'Teknoloji', prompt: 'HTTP kısaltmasındaki H harfi neyi ifade eder?', answers: ['Hyper', 'Host', 'Hardware', 'Hybrid'], correct: 'A' },
  { category: 'Genel Kültür', prompt: 'Türkiye’nin başkenti hangisidir?', answers: ['İstanbul', 'Ankara', 'İzmir', 'Bursa'], correct: 'B' },
]

const normalizeCategory = (value: string) => value.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i')

const makeQuestionSet = (category: string, count: number) => {
  const selected = normalizeCategory(category)
  const family: Record<string, string[]> = {
    'dunya sinemasi': ['sinema'], 'turk sinemasi': ['sinema'], 'film tarihi': ['sinema'], 'film yonetmenleri': ['sinema'],
    'kimya': ['bilim'], 'astronomi': ['bilim'], 'uzay': ['bilim'], 'astrofizik': ['bilim'], 'genetik': ['biyoloji'],
    'dunya tarihi': ['tarih'], 'antik cag': ['tarih'], 'osmanli tarihi': ['tarih'], 'turk tarihi': ['tarih'],
    'klasik muzik': ['muzik'], 'muzik tarihi': ['muzik'], 'dunya cografyasi': ['cografya'], 'ulkeler ve baskentler': ['cografya'],
  }
  const requested = [selected, ...(family[selected] || [])]
  const matching = questionBank.filter(question => requested.includes(normalizeCategory(question.category)))
  const general = questionBank.filter(question => question.category === 'Genel Kültür')
  const pool = matching.length >= count ? matching : [...matching, ...general, ...questionBank.filter(question => !matching.includes(question) && question.category !== 'Genel Kültür')]
  const shuffled = [...pool].sort(() => Math.random() - .5)
  return shuffled.slice(0, count)
}

const allCategories: [string, number][] = [
  ['Tümü',0],['Sinema',18],['Bilim',6],['Tarih',2],['Müzik',19],['Spor',23],['Sanat',21],['Coğrafya',2],
  ['Din',4],['Fizik',12],['Matematik',14],['Ekonomi',15],['Epidemiyoloji',11],['Biyoloji',8],['Psikoloji',10],['Teknoloji',16],['Felsefe',20],['Genel Kültür',0],
  ['Dünya Tarihi',2],['Antik Çağ',2],['Eski Mısır',2],['Antik Yunan',2],['Roma Tarihi',2],['Orta Çağ',2],['Rönesans',2],['Osmanlı Tarihi',2],['Türk Tarihi',2],['İslam Tarihi',4],['Dinler Tarihi',4],['Dünya Savaşları',17],['Siyaset Tarihi',17],['Bilim Tarihi',6],
  ['Dünya Coğrafyası',1],['Ülkeler ve Başkentler',1],['Bayraklar',3],['Haritalar',2],['Kültürler',1],['Jeopolitik',17],['Şehirler',1],['Doğa ve Çevre',1],['İklim',1],['Okyanuslar',1],
  ['Kimya',7],['Organik Kimya',7],['Genetik',8],['Hücre Biyolojisi',8],['Zooloji',8],['Botanik',8],['Ekoloji',8],['Evrim',8],['Astronomi',6],['Uzay',6],['Astrofizik',6],['Jeoloji',6],['Meteoroloji',6],['Oşinografi',6],['İnsan Vücudu',11],['Tıp',11],['Beslenme',11],['Nörobilim',10],
  ['Geometri',14],['Olasılık',14],['İstatistik',15],['Mantık',14],['Cebir',14],['Sayılar',14],['Bilmece ve Mantık',0],['Kelime Bilgisi',0],['Dil Bilgisi',0],['Yabancı Diller',0],
  ['Dünya Sineması',18],['Türk Sineması',18],['Film Tarihi',18],['Film Yönetmenleri',18],['Film Müzikleri',19],['Edebiyat',20],['Dünya Edebiyatı',20],['Türk Edebiyatı',20],['Klasik Eserler',20],['Şiir',20],['Tiyatro',22],['Mimari',21],['Resim',21],['Fotoğraf',21],['Moda',21],['Tasarım',21],
  ['Müzik Tarihi',19],['Klasik Müzik',19],['Rock',19],['Pop',19],['Caz',19],['Halk Müziği',19],['Müzik Teorisi',19],['Dünya Müzikleri',19],['Enstrümanlar',19],
  ['Teknoloji Tarihi',16],['Bilgisayar',16],['Programlama',16],['İnternet',16],['Yapay Zeka',16],['Siber Güvenlik',16],['Mühendislik',16],['Uzay Teknolojileri',16],['İnovasyon',16],['Girişimcilik',15],['Ekonomi Tarihi',15],['Finans',15],['İş Dünyası',15],['Pazarlama',15],['Kripto ve Dijital Ekonomi',15],
  ['Sosyoloji',17],['Antropoloji',17],['Hukuk',17],['Psikoloji Tarihi',10],['Felsefe Tarihi',20],['Etik',20],['Sosyal Bilimler',17],['Eğitim',0],['Sağlık',11],['Günlük Yaşam',0],
  ['Futbol',23],['Basketbol',23],['Tenis',23],['Formula 1',23],['Olimpiyatlar',23],['Atletizm',23],['Yüzme',23],['Bisiklet',23],['Dövüş Sporları',23],['Kış Sporları',23],['Satranç',14],['Masa Oyunları',14],['Video Oyunları',16],['Oyun Tarihi',16],
  ['Yemek Kültürü',21],['Dünya Mutfağı',21],['Türk Mutfağı',21],['Kahve',21],['Tatlılar',21],['Hayvanlar',8],['Bitkiler',8],['Hayvan Davranışları',8],['Çevre Bilinci',8],['Sürdürülebilirlik',8],['Tarım',8],['Mimari Tarihi',21]
]

function NavIcon({ kind }: { kind: NavIconKind }) {
  const common = { className: 'nav-icon', viewBox: '0 0 24 24', fill: 'none', xmlns: 'http://www.w3.org/2000/svg', 'aria-hidden': true }

  if (kind === 'home') return <svg {...common}>
    <path d="M3.7 10.4 12 3.9l8.3 6.5v8.7a1.7 1.7 0 0 1-1.7 1.7H5.4a1.7 1.7 0 0 1-1.7-1.7v-8.7Z" />
    <path className="nav-icon-accent" d="M8.1 9.6h7.8M9 20.7v-6.3h6v6.3" />
    <path className="nav-icon-jewel" d="m12 6.6.5 1 .9.4-.9.4-.5 1-.5-1-.9-.4.9-.4.5-1Z" />
  </svg>

  if (kind === 'lobbies') return <svg {...common}>
    <ellipse className="nav-icon-accent" cx="12" cy="14.2" rx="8.7" ry="5.6" />
    <circle cx="12" cy="6.3" r="2.2" /><circle cx="4.7" cy="11.1" r="1.7" /><circle cx="19.3" cy="11.1" r="1.7" />
    <path d="M9.1 15.8c.5-1.3 1.5-2 2.9-2s2.4.7 2.9 2M3.3 16.2c.4-.9 1-1.4 2-1.4M20.7 16.2c-.4-.9-1-1.4-2-1.4" />
    <circle className="nav-icon-jewel" cx="12" cy="14.2" r=".9" />
  </svg>

  if (kind === 'modes') return <svg {...common}>
    <rect x="3.4" y="4" width="7.4" height="7.4" rx="2" /><rect x="13.2" y="4" width="7.4" height="7.4" rx="2" />
    <rect className="nav-icon-accent" x="8.3" y="13.1" width="7.4" height="7.4" rx="2" />
    <path d="m6.3 7.7 1 1 1.7-2M15.6 7.7h2.6M12 15.7v2.2M10.9 16.8h2.2" />
    <circle className="nav-icon-jewel" cx="12" cy="16.8" r=".7" />
  </svg>

  if (kind === 'tasks') return <svg {...common}>
    <path d="M7 4.9H5.8A1.8 1.8 0 0 0 4 6.7v12.1a1.8 1.8 0 0 0 1.8 1.8h12.4a1.8 1.8 0 0 0 1.8-1.8V6.7a1.8 1.8 0 0 0-1.8-1.8H17" />
    <path className="nav-icon-accent" d="M9 3.2h6a1.3 1.3 0 0 1 1.3 1.3v1.2H7.7V4.5A1.3 1.3 0 0 1 9 3.2Z" />
    <path d="m7.4 10.8 1.2 1.2 2-2.2M12.8 11h3.8M7.4 16.1l1.2 1.2 2-2.2M12.8 16.3h3.8" />
  </svg>

  if (kind === 'tournament') return <svg {...common}>
    <path d="M8 4h8v3.9c0 3.1-1.6 5.4-4 5.4s-4-2.3-4-5.4V4Z" />
    <path className="nav-icon-accent" d="M8 6H4.2v1.2c0 2.6 1.4 4.2 4.6 4.4M16 6h3.8v1.2c0 2.6-1.4 4.2-4.6 4.4M12 13.3v3.3M8.3 20h7.4M9.4 16.6h5.2V20" />
    <path className="nav-icon-jewel" d="m12 6.2.7 1.3 1.5.2-1.1 1 .3 1.5-1.4-.7-1.4.7.3-1.5-1.1-1 1.5-.2.7-1.3Z" />
  </svg>

  if (kind === 'howto') return <svg {...common}>
    <path d="M3.5 5.3c3.3-.8 6-.2 8.5 1.8v12.1c-2.5-2-5.2-2.6-8.5-1.8V5.3ZM20.5 5.3c-3.3-.8-6-.2-8.5 1.8v12.1c2.5-2 5.2-2.6 8.5-1.8V5.3Z" />
    <path className="nav-icon-accent" d="M14.8 9.4c.2-1.1 1-1.7 2.1-1.7 1.2 0 2 .7 2 1.8 0 1.5-1.7 1.7-1.7 3" />
    <circle className="nav-icon-jewel" cx="17.2" cy="14.9" r=".8" />
  </svg>

  if (kind === 'leaderboard') return <svg {...common}>
    <path d="M3.6 19.8h16.8M4.8 13.2h4.3v6.6H4.8v-6.6ZM9.9 9.3h4.3v10.5H9.9V9.3ZM15 14.8h4.3v5H15v-5Z" />
    <path className="nav-icon-accent" d="m12 3.2.8 1.6 1.8.3-1.3 1.3.3 1.8-1.6-.8-1.6.8.3-1.8-1.3-1.3 1.8-.3.8-1.6Z" />
  </svg>

  if (kind === 'profile') return <svg {...common}>
    <circle className="nav-icon-accent" cx="12" cy="12" r="9" />
    <circle cx="12" cy="8.8" r="3" /><path d="M6.8 18.3c.9-2.8 2.6-4.2 5.2-4.2s4.3 1.4 5.2 4.2" />
    <path className="nav-icon-jewel" d="M4.4 7.2 3 6.4M19.6 7.2l1.4-.8M12 3V1.6" />
  </svg>

  return <svg {...common}>
    <circle cx="12" cy="12" r="3.2" />
    <path className="nav-icon-accent" d="M9.6 3.3 10.2 2h3.6l.6 1.3 1.2.5 1.3-.5 2.5 2.5-.5 1.3.5 1.2 1.3.6v3.6l-1.3.6-.5 1.2.5 1.3-2.5 2.5-1.3-.5-1.2.5-.6 1.3h-3.6l-.6-1.3-1.2-.5-1.3.5-2.5-2.5.5-1.3-.5-1.2-1.3-.6V8.9l1.3-.6.5-1.2-.5-1.3 2.5-2.5 1.3.5 1.2-.5Z" />
    <circle className="nav-icon-jewel" cx="12" cy="12" r="1" />
  </svg>
}

function App() {
  const realtime = useRealtimeGame()
  const [screen, setScreen] = useState<Screen>('home')
  const [selected, setSelected] = useState('')
  const [mode, setMode] = useState<'classic' | 'lightning'>('classic')
  const [circleRequested, setCircleRequested] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('Tümü')
  const [roomOpen, setRoomOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [matchRequest, setMatchRequest] = useState<{ mode: 'classic' | 'lightning'; category: string } | null>(null)
  const [showMatchIntro, setShowMatchIntro] = useState(false)
  const [matchQuestions, setMatchQuestions] = useState<QuizQuestion[]>(() => makeQuestionSet('Tümü', 10))
  const [questionIndex, setQuestionIndex] = useState(0)
  const [matchScore, setMatchScore] = useState(0)
  const [correctAnswers, setCorrectAnswers] = useState(0)
  const [answerSeconds, setAnswerSeconds] = useState(0)
  const [opponentScores, setOpponentScores] = useState<Record<string, number>>({ Baran: 0, Elif: 0, Kaan: 0, Zeynep: 0 })
  const [roundVotes, setRoundVotes] = useState<Record<string, string>>({})
  const [lastServerQuestion, setLastServerQuestion] = useState<QuizQuestion | null>(null)
  const [goldGuideOpen, setGoldGuideOpen] = useState(false)
  const [coins, setCoins] = useState(() => {
    const saved = Number(window.localStorage.getItem('qt-coins'))
    return Number.isFinite(saved) && saved >= 0 ? saved : 2450
  })
  const [ownedCollection, setOwnedCollection] = useState<string[]>(() => {
    try { const raw = window.localStorage.getItem('qt-owned'); if (!raw) return ['starmap', 'aurora']; const saved = JSON.parse(raw); return Array.isArray(saved) && saved.length ? saved : ['starmap', 'aurora'] } catch { return ['starmap', 'aurora'] }
  })
  const [equippedItem, setEquippedItem] = useState(() => window.localStorage.getItem('qt-equipped') || 'starmap')
  const serverState = realtime.state
  const serverQuestion = serverState?.question
  const serverControlled = Boolean(serverState && serverState.phase !== 'lobby')
  const serverAnswerKey = serverState?.yourChoice === null || serverState?.yourChoice === undefined ? '' : ['A', 'B', 'C', 'D'][serverState.yourChoice]
  const incomingServerQuestion: QuizQuestion | null = serverQuestion ? {
    category: serverQuestion.category,
    prompt: serverQuestion.text,
    answers: [...serverQuestion.choices] as QuizQuestion['answers'],
    correct: '',
  } : null
  const revealedServerQuestion = lastServerQuestion && serverState?.reveal
    ? { ...lastServerQuestion, correct: ['A', 'B', 'C', 'D'][serverState.reveal.correctIndex] }
    : lastServerQuestion
  const activeQuestion: QuizQuestion = incomingServerQuestion ?? (serverState?.phase === 'reveal' && revealedServerQuestion ? revealedServerQuestion : matchQuestions[questionIndex])
  const activeQuestionIndex = serverState?.round.index ?? questionIndex
  const activeQuestionTotal = serverState?.round.total ?? matchQuestions.length
  const activeScore = serverState?.players.find(player => player.id === serverState.youId)?.score ?? matchScore
  const activeOpponentScores = serverState ? Object.fromEntries(serverState.players.filter(player => player.id !== serverState.youId).map(player => [player.name, player.score])) : opponentScores

  const nav = (next: Screen) => { if (next === 'play') setSelected(''); if (next !== 'wordroute') setCircleRequested(false); setScreen(next) }
  const launchGame = (nextMode?: 'classic' | 'lightning', nextCategory?: string) => {
    const activeMode = nextMode || mode
    const activeCategory = nextCategory || selectedCategory
    if (nextMode) setMode(nextMode)
    if (nextCategory) setSelectedCategory(nextCategory)
    if (realtime.status === 'connected') {
      realtime.ready(true)
      setRoomOpen(true)
      return
    }
    setMatchQuestions(makeQuestionSet(activeCategory, activeMode === 'lightning' ? 5 : 10))
    setQuestionIndex(0)
    setMatchScore(0)
    setCorrectAnswers(0)
    setAnswerSeconds(0)
    setOpponentScores({ Baran: 0, Elif: 0, Kaan: 0, Zeynep: 0 })
    setRoundVotes({})
    setShowMatchIntro(true)
    nav('play')
  }
  const findMatch = (nextMode: 'classic' | 'lightning', category = 'Tümü') => {
    setMode(nextMode)
    setSelectedCategory(category || 'Tümü')
    setMatchRequest({ mode: nextMode, category: category || 'Tümü' })
  }

  const resolveQuestion = (secondsRemaining: number) => {
    if (serverState?.phase === 'question') {
      const choice = ['A', 'B', 'C', 'D'].indexOf(selected)
      if (choice >= 0) realtime.answer(choice)
      return
    }
    const currentQuestion = matchQuestions[questionIndex]
    const answerKeys = ['A', 'B', 'C', 'D']
    const correctIndex = answerKeys.indexOf(currentQuestion?.correct || 'A')
    const votes = ['Baran', 'Elif', 'Kaan', 'Zeynep'].reduce<Record<string, string>>((result, name, index) => {
      const getsCorrect = (questionIndex + index * 2 + (mode === 'lightning' ? 1 : 0)) % 4 !== 1
      result[name] = getsCorrect ? currentQuestion.correct : answerKeys[(correctIndex + index + 1) % answerKeys.length]
      return result
    }, {})
    const isCorrect = selected === currentQuestion?.correct
    const basePoints = mode === 'lightning' ? 360 : 260
    const timeBonus = Math.round(secondsRemaining * (mode === 'lightning' ? 35 : 22))
    const streakBonus = isCorrect && correctAnswers >= 2 ? 80 : 0
    const earnedPoints = isCorrect ? basePoints + timeBonus + streakBonus : 0
    setAnswerSeconds(secondsRemaining)
    setRoundVotes(votes)
    if (isCorrect) {
      setCorrectAnswers(value => value + 1)
      setMatchScore(value => value + earnedPoints)
    }
    setOpponentScores(current => {
      const next = { ...current }
      Object.entries(votes).forEach(([name, answer], index) => {
        if (answer === currentQuestion.correct) next[name] += (mode === 'lightning' ? 270 : 205) + ((questionIndex + index) % 3) * 35
      })
      return next
    })
    window.setTimeout(() => nav('reveal'), 80)
  }
  const advanceMatch = () => {
    if (serverControlled) return
    if (questionIndex + 1 >= matchQuestions.length) {
      nav('finish')
      return
    }
    setQuestionIndex(value => value + 1)
    setSelected('')
    nav('play')
  }

  useEffect(() => { window.localStorage.setItem('qt-coins', String(coins)) }, [coins])
  useEffect(() => { window.localStorage.setItem('qt-owned', JSON.stringify(ownedCollection)) }, [ownedCollection])
  useEffect(() => { window.localStorage.setItem('qt-equipped', equippedItem) }, [equippedItem])
  useEffect(() => {
    if (incomingServerQuestion) setLastServerQuestion(incomingServerQuestion)
  }, [serverQuestion?.deadline])
  useEffect(() => {
    if (!realtime.message) return
    const timeout = window.setTimeout(realtime.dismissMessage, 3200)
    return () => window.clearTimeout(timeout)
  }, [realtime.message])
  useEffect(() => {
    if (!serverState) return
    if (serverState.phase === 'question') {
      setSelected('')
      setShowMatchIntro(false)
      if (serverState.gameMode === 'circle') {
        setCircleRequested(true)
        setScreen('wordroute')
      } else setScreen('play')
    }
    if (serverState.phase === 'reveal') setScreen(serverState.gameMode === 'circle' ? 'wordroute' : 'reveal')
    if (serverState.phase === 'podium') setScreen(serverState.gameMode === 'circle' ? 'wordroute' : 'finish')
  }, [serverState?.phase, serverState?.round.index])

  return <div className={`app-shell ${(['play','reveal','finish'] as Screen[]).includes(screen) ? 'game-shell' : ''}`}>
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><img src={appLogo} alt="Triviara logosu" /></span><span>Quiz<span>Tavern</span></span></div>
      <nav>
        {([['home','home','Ana Sayfa'],['lobbies','lobbies','Lobiler'],['modes','modes','Modlar'],['tasks','tasks','Görevler'],['tournament','tournament','Turnuva'],['howto','howto','Nasıl Oynanır'],['leaderboard','leaderboard','Sıralama'],['profile','profile','Profil'],['home','settings','Ayarlar']] as const).map(([id, icon, label]) => {
          const isSettings = label === 'Ayarlar'
          const isActive = isSettings ? settingsOpen : screen === id
          return <button key={label} className={isActive ? 'nav-item active' : 'nav-item'} onClick={() => isSettings ? setSettingsOpen(true) : nav(id)}><NavIcon kind={icon} />{label}</button>
        })}
       </nav>
    </aside>
    <main className="main">
      {(['play','reveal','finish','history','social'] as Screen[]).includes(screen) && <header className="topbar"><div><h1>{screen === 'finish' ? <>Maç <span className="accent">Sonu</span></> : screen === 'history' ? <>Maç <span className="accent">Geçmişi</span></> : screen === 'social' ? <>Sosyal <span className="accent">Merkez</span></> : <>Soru <span className="accent">{activeQuestionIndex + 1}</span> / {activeQuestionTotal}</>}</h1>{screen === 'finish' && <p>Harika oyun, skorunu kutla.</p>}{screen === 'history' && <p>Performansını incele, gelişimini gör.</p>}</div></header>}
      {screen === 'home' && <Home onPlay={findMatch} onOpenRoom={() => setRoomOpen(true)} />}
      {screen === 'lobbies' && <Lobbies onPlay={launchGame} />}
      {screen === 'modes' && <Modes onClassic={(category) => launchGame('classic', category)} onFitil={(category) => launchGame('lightning', category)} onCircle={() => { if (realtime.status === 'connected') realtime.start('circle'); setCircleRequested(true); nav('wordroute') }} onLobbies={() => nav('lobbies')} />}
      {screen === 'play' && <Play mode={mode} category={selectedCategory} question={activeQuestion} questionIndex={activeQuestionIndex} totalQuestions={activeQuestionTotal} selected={serverAnswerKey || selected} setSelected={setSelected} intro={showMatchIntro} state={serverState} deadline={serverQuestion?.deadline} answeredCount={serverState?.answeredCount} eligibleCount={serverState?.eligibleCount} onIntroDone={() => setShowMatchIntro(false)} onLock={resolveQuestion} />}
      {screen === 'reveal' && (serverState?.reveal ? <ServerReveal state={serverState} question={activeQuestion} /> : <Reveal question={activeQuestion} questionIndex={activeQuestionIndex} totalQuestions={activeQuestionTotal} mode={mode} selected={serverAnswerKey || selected} secondsRemaining={answerSeconds} correctBefore={correctAnswers} votes={roundVotes} revealUntil={serverState?.reveal?.until} serverControlled={serverControlled} onNext={advanceMatch} />)}
      {screen === 'finish' && <Finish score={activeScore} correct={correctAnswers} total={activeQuestionTotal} category={selectedCategory} mode={mode} opponentScores={activeOpponentScores} onHome={() => nav('home')} onAgain={() => serverControlled ? realtime.playAgain() : launchGame()} />}
      {screen === 'history' && <History />}
      {screen === 'social' && <SocialHub onPlay={launchGame} onOpenRoom={() => setRoomOpen(true)} />}
      {screen === 'tasks' && <Tasks />}
      {screen === 'tournament' && <Tournament onPlay={() => launchGame()} />}
      {screen === 'howto' && <HowTo onPlay={() => launchGame()} />}
      {screen === 'profile' && <Profile />}
      {screen === 'collection' && <Collection coins={coins} owned={ownedCollection} equipped={equippedItem} onSpend={amount => setCoins(value => value - amount)} onOwn={id => setOwnedCollection(current => [...current, id])} onEquip={setEquippedItem} />}
      {screen === 'leaderboard' && <Leaderboard />}
      {screen === 'wordroute' && <WordRoute onBack={() => nav('home')} multiplayer={circleRequested || serverState?.gameMode === 'circle'} state={serverState} onAnswerCircle={realtime.answerCircle} onAgain={realtime.playAgain} />}
      {roomOpen && <ActiveRoomModal onClose={() => setRoomOpen(false)} state={serverState} connectionStatus={realtime.status} onReady={realtime.ready} onStart={() => realtime.start('quiz')} onStartDemo={() => { setRoomOpen(false); launchGame('classic', selectedCategory) }} onAddBot={realtime.addBot} />}
      {matchRequest && <MatchmakingModal mode={matchRequest.mode} category={matchRequest.category} onCancel={() => setMatchRequest(null)} onReady={() => { const request = matchRequest; setMatchRequest(null); launchGame(request.mode, request.category) }} />}
      {notificationsOpen && <NotificationsPanel onClose={() => setNotificationsOpen(false)} />}
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      {goldGuideOpen && <GoldGuideModal onClose={() => setGoldGuideOpen(false)} onNavigate={next => { setGoldGuideOpen(false); nav(next) }} />}
      {realtime.message && <button className="realtime-toast" onClick={realtime.dismissMessage}>{translate('tr', realtime.message.key, realtime.message.params)}</button>}
    </main>
  </div>
}

function Modes({ onClassic, onFitil, onCircle, onLobbies }: { onClassic: (category: string) => void, onFitil: (category: string) => void, onCircle: () => void, onLobbies: () => void }) {
  type ModeKey = 'classic' | 'fitil' | 'circle'
  const [selectedMode, setSelectedMode] = useState<ModeKey>('classic')
  const [category, setCategory] = useState('Karışık')
  const modes: Record<ModeKey, { eyebrow: string; title: string; rule: string; description: string; meta: string[]; art: string; accent: string; mark: string }> = {
    classic: { eyebrow: 'TEMEL MOD', title: 'Klasik', rule: 'Dört şık, tek doğru.', description: 'Bilgini, hızını ve rakiplerini aynı masada sınayan Triviara deneyimi.', meta: ['10 soru', '15 sn / soru', '2–6 oyuncu'], art: modeClassicBackground, accent: 'cyan', mark: '01' },
    fitil: { eyebrow: 'HIZLI MOD', title: 'Fitil', rule: 'Az süre, saf refleks.', description: 'Beş kısa soruda süre bitmeden seç, kilitle ve hız bonusunu yakala.', meta: ['5 soru', '8 sn / soru', 'Hız bonusu'], art: modeFitilBackground, accent: 'gold', mark: '8s' },
    circle: { eyebrow: 'KELİME & BİLGİ', title: 'Çember', rule: 'Her harf bir ipucu.', description: 'Cevabı doğru harfle başlat, takıldığında pas geç ve çemberi tamamla.', meta: ['20 harf', '3 dakika', 'Pas hakkı'], art: modeCircleBackground, accent: 'violet', mark: 'A–Z' },
  }
  const current = modes[selectedMode]
  const begin = () => {
    if (selectedMode === 'classic') onClassic(category === 'Karışık' ? 'Tümü' : category)
    if (selectedMode === 'fitil') onFitil(category === 'Karışık' ? 'Tümü' : category)
    if (selectedMode === 'circle') onCircle()
  }

  return <section className="modes-page">
    <header className="modes-head">
      <div><span className="eyebrow">OYUN MODLARI</span><h2>Masayı nasıl <span>kurmak</span> istersin?</h2><p>Temponu seç, kategorini belirle ve masaya katıl.</p></div>
      <div className="mode-live-status"><i></i><span><b>3 mod açık</b><small>6 açık masa</small></span></div>
    </header>

    <div className="mode-showcase" role="list" aria-label="Oyun modları">
      {(Object.keys(modes) as ModeKey[]).map(key => {
        const item = modes[key]
        const active = key === selectedMode
        return <article key={key} role="listitem" className={`mode-showcase-card ${item.accent} ${active ? 'selected' : ''}`} onClick={() => setSelectedMode(key)}>
          <div className="mode-showcase-art" style={{ backgroundImage: `url(${item.art})` }}><span className="mode-art-mark">{item.mark}</span><span className="mode-state">{active ? 'SEÇİLİ MOD' : item.eyebrow}</span></div>
          <div className="mode-showcase-copy"><div><h3>{item.title}</h3><strong>{item.rule}</strong></div><p>{item.description}</p><div className="mode-meta">{item.meta.map(value => <span key={value}>{value}</span>)}</div><button type="button" className="mode-select-button" aria-label={`${item.title} modunu seç`}>{active ? 'Seçildi' : 'Modu seç'} <b>→</b></button></div>
        </article>
      })}
    </div>

    <section className={`mode-launch-panel card ${current.accent}`}>
      <div className="mode-launch-intro"><span className="mode-launch-mark">{current.mark}</span><div><span className="eyebrow">SEÇİLİ MOD</span><h3>{current.title}</h3><p>{current.rule} {current.description}</p></div></div>
      <div className="mode-category-control"><span>KATEGORİ</span>{selectedMode === 'circle' ? <p>Çember, kelime ve genel bilgi rotasıyla oynanır.</p> : <div>{['Karışık', 'Sinema', 'Bilim', 'Tarih', 'Spor', 'Sanat'].map(value => <button type="button" key={value} className={category === value ? 'active' : ''} onClick={() => setCategory(value)}>{value}</button>)}</div>}</div>
      <div className="mode-launch-actions"><button type="button" className="secondary" onClick={onLobbies}>Açık masalar</button><button type="button" className="primary" onClick={begin}>{selectedMode === 'circle' ? 'Çember’e gir' : `${current.title} oyna`} <b>→</b></button></div>
    </section>

    <footer className="mode-presence-strip card"><span className="eyebrow">ŞU ANDA OYNANIYOR</span><div><b><i className="presence classic"></i>Klasik</b><small>3 açık masa</small></div><div><b><i className="presence fitil"></i>Fitil</b><small>2 açık masa</small></div><div><b><i className="presence circle"></i>Çember</b><small>1 açık masa</small></div><button type="button" onClick={onLobbies}>Tüm lobiler →</button></footer>
  </section>
}

function HeroGlyph({ kind }: { kind: 'questions' | 'time' | 'players' | 'category' | 'play' }) {
  const common = { viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true }
  if (kind === 'questions') return <svg {...common}><path d="M7 4.5h10a2 2 0 0 1 2 2v12H7a2 2 0 0 1-2-2v-10a2 2 0 0 1 2-2Z"/><path d="M9 9h6M9 13h4M9 17h3"/><path d="M7 4.5v14"/></svg>
  if (kind === 'time') return <svg {...common}><circle cx="12" cy="13" r="7.5"/><path d="M12 9v4l2.8 1.7M9.5 3h5M12 5.5V3"/></svg>
  if (kind === 'players') return <svg {...common}><circle cx="9" cy="8" r="3"/><circle cx="17.2" cy="9.2" r="2.2"/><path d="M3.8 19c.7-3.4 2.4-5 5.2-5s4.5 1.6 5.2 5M14.4 14.5c2.9-.7 4.9.6 5.8 3.8"/></svg>
  if (kind === 'category') return <svg {...common}><path d="M4 6.2A2.2 2.2 0 0 1 6.2 4h4.2l1.7 2.1H18A2 2 0 0 1 20 8v9.8a2.2 2.2 0 0 1-2.2 2.2H6.2A2.2 2.2 0 0 1 4 17.8V6.2Z"/><path d="M8.2 11.2h7.6M8.2 15h4.8"/></svg>
  return <svg {...common}><path d="m9.3 6.8 8.2 5.2-8.2 5.2V6.8Z"/></svg>
}

function Home({ onPlay, onOpenRoom }: { onPlay: (mode: 'classic' | 'lightning', category?: string) => void, onOpenRoom: () => void }) {
  const [copied, setCopied] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('Tümü')
  const [allCategoriesOpen, setAllCategoriesOpen] = useState(false)
  const iconPosition = (index:number) => ({ backgroundImage: `url(${categoryPack})`, backgroundPosition: `${(index % 6) * 20}% ${Math.floor(index / 6) * 33.333}%` })
  const copyInvite = async () => { try { await navigator.clipboard?.writeText('discord.gg/quiztavern-abc123') } catch {} setCopied(true); window.setTimeout(() => setCopied(false), 1800) }
  const launch = (nextMode:'classic'|'lightning') => onPlay(nextMode, selectedCategory)
  return <div className="home-grid">
    <section className="hero hero-redesign card" style={{ backgroundImage: `url(${heroImage})` }}><div className="hero-copy hero-simple"><span className="hero-simple-badge"><i></i> KLASİK</span><div className="hero-simple-title"><h2>Dört şık, <span className="cool-accent">tek doğru.</span></h2><p>Kategorini seç, cevabını kilitle ve masadaki yerini al.</p></div><div className="hero-simple-facts"><div><HeroGlyph kind="questions" /><span><b>10 soru</b><small>Tek maç</small></span></div><div><HeroGlyph kind="time" /><span><b>15 saniye</b><small>Her soru</small></span></div><div><HeroGlyph kind="players" /><span><b>6 oyuncu</b><small>Canlı masa</small></span></div></div><div className="hero-simple-actions"><button className="hero-simple-play" onClick={() => launch('classic')}><span><HeroGlyph kind="play" /></span><p><b>{selectedCategory === 'Tümü' ? 'Hemen Oyna' : `${selectedCategory} ile Oyna`}</b><small>Eşleşmeyi başlat</small></p><i>→</i></button><button className="hero-simple-category" onClick={() => setAllCategoriesOpen(true)}><HeroGlyph kind="category" /><span><small>Kategori</small><b>{selectedCategory === 'Tümü' ? 'Tüm kategoriler' : selectedCategory}</b></span><i>⌄</i></button></div></div><div className="category-orbit"><div className="orbit-ring r1"></div><div className="orbit-ring r2"></div><div className="question-orb">?</div>{categories.map(([icon,name,color], i) => <div className={`category-icon ${color} c${i}`} key={name}><strong>{icon}</strong><small>{name}</small></div>)}</div></section>
    <aside className="right-column"><section className="card room"><div className="section-title"><h3>Canlı Oda <span className="accent">• CANLI</span></h3><div className="room-title-actions"><span className="count">5 / 8</span><button className="room-manage" onClick={onOpenRoom}>Yönet</button></div></div><div className="occupancy">{Array.from({length:8}).map((_,i)=><span className={i<5 ? "on" : ""} key={i}><i className="presence-dot"></i></span>)}</div>{players.map(([l,n,c,score]) => <div className="player-row" key={n}><span className={`avatar ${c}`}>{l}</span><b>{n}</b><small>{n === 'Kaan' ? 'Bağlanıyor' : n === 'Sen' ? 'Odada' : 'Hazır'}</small><strong>{score}</strong><i className={n==='Kaan'?'offline':''}></i></div>)}<button className="invite" onClick={copyInvite}><span className="invite-icon">+</span> {copied ? 'Bağlantı kopyalandı' : 'Arkadaşını Davet Et'}</button></section></aside>
    {allCategoriesOpen && <div className="category-modal-backdrop" onClick={() => setAllCategoriesOpen(false)}><section className="category-modal card" onClick={event => event.stopPropagation()}><div className="category-modal-head"><div><span className="eyebrow">KATEGORİ ARŞİVİ</span><h2>Tüm kategoriler <small>{allCategories.length} seçenek</small></h2></div><button className="modal-close" onClick={() => setAllCategoriesOpen(false)} aria-label="Kapat">×</button></div><p>Bir kategori seç; seçimin Klasik ve Yıldırım Turu kartlarına doğrudan uygulanır.</p><div className="category-modal-grid">{allCategories.map(([name,icon])=><button className={selectedCategory===name?'selected':''} key={name} onClick={() => { setSelectedCategory(name); setAllCategoriesOpen(false) }}><span className="category-pack-icon" style={iconPosition(icon)} aria-hidden="true"></span>{name}</button>)}</div></section></div>}
  </div>
}

function Lobbies({ onPlay }: { onPlay:(mode:'classic'|'lightning')=>void }) {
  type Room = {name:string; category:string; mode:'Klasik'|'Yıldırım Turu'; count:string; time:string; color:string; host:string; code:string}
  const [filter, setFilter] = useState('Tümü')
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [rooms, setRooms] = useState<Room[]>([
    {name:'Elif’in Sinema Odası',category:'Sinema',mode:'Klasik',count:'3 / 6',time:'12 sn',color:'mint',host:'Elif',code:'CINE24'},
    {name:'Bilim Meraklıları',category:'Bilim',mode:'Klasik',count:'4 / 6',time:'28 sn',color:'blue',host:'Baran',code:'BILIM7'},
    {name:'Hızlı Tur #482',category:'Genel Kültür',mode:'Yıldırım Turu',count:'5 / 8',time:'6 sn',color:'amber',host:'Sen',code:'HIZLI9'},
    {name:'Gece Kuşları',category:'Tarih',mode:'Klasik',count:'2 / 6',time:'44 sn',color:'lavender',host:'Zeynep',code:'TARIH3'},
    {name:'Finale Doğru',category:'Spor',mode:'Klasik',count:'6 / 8',time:'Başlıyor',color:'rust',host:'Kaan',code:'SPOR11'},
    {name:'Sessiz Salon',category:'Sinema',mode:'Klasik',count:'1 / 4',time:'Özel',color:'gold',host:'Mert',code:'SALO2'}
  ])
  const visible = filter === 'Tümü' ? rooms : rooms.filter(room => room.category === filter || room.mode === filter)
  const openRoom = (room:Room) => setSelectedRoom(room)
  const createRoom = (room:Room) => { setRooms(current => [room, ...current]); setCreateOpen(false); setSelectedRoom(room) }
  const roomTimeTone = (time: string) => {
    const seconds = Number.parseInt(time, 10)
    if (Number.isNaN(seconds)) return time === 'Başlıyor' ? 'critical' : 'neutral'
    if (seconds <= 8) return 'critical'
    if (seconds <= 15) return 'warning'
    return 'normal'
  }
  return <section className="lobbies-page">
    <section className="lobby-hero card" style={{backgroundImage:`url(${lobbyBanner})`}}><div><span className="pill cool-pill">CANLI LOBİLER</span><h2>Bir masaya katıl,<br/><span>rakiplerini bul.</span></h2><p>Şu anda oynayan oyuncuların açık odalarını keşfet.</p></div><div className="lobby-online"><b>24</b><small>oyuncu çevrimiçi</small></div></section>
    <div className="lobbies-toolbar"><div><h2>Açık odalar</h2><p>Katılmaya hazır {visible.length} masa var.</p></div><div className="lobby-filters">{['Tümü','Sinema','Bilim','Tarih','Yıldırım Turu'].map(item=><button className={filter===item?'active':''} key={item} onClick={() => setFilter(item)}>{item}</button>)}</div><button className="primary create-lobby" onClick={() => setCreateOpen(true)}>+ Oda Oluştur</button></div>
    <div className="lobby-grid">{visible.map(room=><article className="lobby-card card" key={room.code} onClick={() => openRoom(room)}><div className="lobby-card-head"><span className={`lobby-icon ${room.color}`}>⌁</span><span className="lobby-live"><i aria-hidden="true"></i>AÇIK</span></div><h3>{room.name}</h3><div className="lobby-meta"><span>{room.category}</span><span>{room.mode}</span></div><div className="lobby-players"><div className="lobby-avatar-stack"><span className="avatar mini lavender">S</span><span className="avatar mini mint">E</span><span className="avatar mini amber">B</span></div><span>{room.count} oyuncu</span><span className={`lobby-time ${roomTimeTone(room.time)}`}>{room.time}</span></div><button className="secondary wide-button" onClick={event => { event.stopPropagation(); openRoom(room) }}>Lobiye Katıl <span>→</span></button></article>)}</div>
    {selectedRoom && <LobbyRoom room={selectedRoom} onClose={() => setSelectedRoom(null)} onPlay={onPlay} />}
    {createOpen && <CreateLobby onClose={() => setCreateOpen(false)} onCreate={createRoom} />}
  </section>
}

function MatchmakingModal({ mode, category, onCancel, onReady }: { mode: 'classic' | 'lightning'; category: string; onCancel: () => void; onReady: () => void }) {
  const [found, setFound] = useState(2)
  const [countdown, setCountdown] = useState<number | null>(null)
  const players = [['S','Sen','lavender'],['E','Elif','mint'],['B','Baran','amber'],['Z','Zeynep','gold'],['R','Robo-Q','blue'],['K','Kaan','rust']]

  useEffect(() => {
    if (found < players.length) {
      const next = window.setTimeout(() => setFound(value => value + 1), 650)
      return () => window.clearTimeout(next)
    }
    if (countdown === null) {
      const ready = window.setTimeout(() => setCountdown(3), 360)
      return () => window.clearTimeout(ready)
    }
    if (countdown === 0) {
      const launch = window.setTimeout(onReady, 260)
      return () => window.clearTimeout(launch)
    }
    const tick = window.setTimeout(() => setCountdown(value => value === null ? null : value - 1), 1000)
    return () => window.clearTimeout(tick)
  }, [found, countdown, onReady, players.length])

  const status = countdown !== null ? (countdown > 0 ? `Masa ${countdown} saniye içinde başlıyor` : 'Maça geçiliyor') : `Oyuncular aranıyor · ${found} / ${players.length}`
  return <div className="matchmaking-backdrop" role="dialog" aria-modal="true"><section className="matchmaking-modal card"><button className="modal-close" onClick={onCancel} aria-label="Eşleştirmeyi iptal et">×</button><div className="match-search-orb" aria-hidden="true"><i></i><b>{countdown ?? found}</b><small>{countdown !== null ? 'sn' : '/ 6'}</small></div><span className="eyebrow">HIZLI EŞLEŞTİRME</span><h2>{mode === 'lightning' ? 'Yıldırım masası hazırlanıyor' : 'Uygun masa aranıyor'}</h2><p>{status}</p><div className="match-chips"><span>{category === 'Tümü' ? 'Tüm kategoriler' : category}</span><span>{mode === 'lightning' ? '5 soru · 8 saniye' : '10 soru · 15 saniye'}</span></div><div className="match-player-grid">{players.map(([letter, name, color], index) => <div className={index < found ? 'match-player joined' : 'match-player'} key={name}><span className={`avatar mini ${color}`}>{letter}</span><b>{index < found ? name : 'Oyuncu aranıyor'}</b><small>{index < found ? (name === 'Sen' ? 'Sen' : 'Hazır') : 'Bağlanıyor'}</small></div>)}</div><button className="secondary match-cancel" onClick={onCancel} disabled={countdown !== null}>Eşleştirmeyi iptal et</button></section></div>
}

function LobbyRoom({ room, onClose, onPlay }: { room: {name:string; category:string; mode:'Klasik'|'Yıldırım Turu'; count:string; time:string; color:string; host:string; code:string}; onClose:()=>void; onPlay:(mode:'classic'|'lightning')=>void }) {
  const [ready, setReady] = useState(false)
  const [starting, setStarting] = useState(false)
  const [startIn, setStartIn] = useState(3)
  const lightning = room.mode === 'Yıldırım Turu'
  useEffect(() => {
    if (!starting) return
    if (startIn === 0) { onPlay(lightning ? 'lightning' : 'classic'); return }
    const timer = window.setTimeout(() => setStartIn(value => value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [starting, startIn, lightning, onPlay])
  return <div className="lobby-modal-backdrop" onClick={onClose}><section className="lobby-room-modal card" onClick={event => event.stopPropagation()}><button className="modal-close" onClick={onClose} aria-label="Kapat">×</button><div className="lobby-room-kicker"><span className={`lobby-icon ${room.color}`}>⌁</span><span>{room.category} · {room.mode}</span></div><h2>{room.name}</h2><p className="lobby-room-sub">Masadaki herkesin durumunu gör; hazır olunca başlangıç geri sayımı seni oyuna geçirir.</p><div className="room-code"><small>ODA KODU</small><b>{room.code}</b><button onClick={() => navigator.clipboard?.writeText(room.code)}>Kopyala</button></div><div className="room-section-head"><h3>Oyuncular <span>5 / {room.count.split('/')[1]?.trim() || '8'}</span></h3><small>Oda sahibi: {room.host}</small></div><div className="room-ready-summary"><span><i></i> 4 oyuncu hazır</span><small>1 oyuncu bekleniyor</small></div><div className="room-player-list">{[['S','Sen','lavender',ready],['E','Elif','mint',true],['B','Baran','amber',true],['K','Kaan','rust',false],['Z','Zeynep','gold',true]].map(([letter,name,color,isReady])=><div className="room-player" key={String(name)}><span className={`avatar mini ${String(color)}`}>{letter}</span><b>{name}</b>{name === room.host && <small>Oda sahibi</small>}<span className={isReady ? 'ready-state' : 'waiting-state'}>{isReady ? 'Hazır' : 'Bekliyor'}</span></div>)}</div><div className="room-actions"><button className={ready ? 'secondary ready-button' : 'secondary'} onClick={() => setReady(value => !value)} disabled={starting}>{ready ? 'Hazırım ✓' : 'Hazırım'}</button><button className="primary" disabled={!ready || starting} onClick={() => setStarting(true)}>{starting ? `Başlıyor · ${startIn}` : 'Masaya Katıl'} <span>→</span></button></div>{starting && <div className="room-starting" role="status"><span>{startIn || '✓'}</span><b>{startIn ? 'Masa hazırlanıyor' : 'Maça geçiliyor'}</b><small>Herkes aynı anda başlıyor.</small></div>}</section></div>
}

function CreateLobby({ onClose, onCreate }: { onClose:()=>void; onCreate:(room:{name:string; category:string; mode:'Klasik'|'Yıldırım Turu'; count:string; time:string; color:string; host:string; code:string})=>void }) {
  const [category, setCategory] = useState('Genel Kültür')
  const [mode, setMode] = useState<'Klasik'|'Yıldırım Turu'>('Klasik')
  const [limit, setLimit] = useState('6')
  const [privateRoom, setPrivateRoom] = useState(false)
  const submit = () => onCreate({name: `${category} ${mode === 'Klasik' ? 'Masası' : 'Turu'}`, category, mode, count:`1 / ${limit}`, time: mode === 'Klasik' ? '15 sn' : '8 sn', color: mode === 'Klasik' ? 'blue' : 'amber', host:'Sen', code:Math.random().toString(36).slice(2,8).toUpperCase()})
  return <div className="lobby-modal-backdrop" onClick={onClose}><section className="create-lobby-modal card" onClick={event => event.stopPropagation()}><button className="modal-close" onClick={onClose} aria-label="Kapat">×</button><span className="eyebrow">YENİ MASA</span><h2>Oda oluştur</h2><p>Arkadaşlarını davet et veya açık lobide rakiplerini bekle.</p><label>Oyun modu<select value={mode} onChange={event => setMode(event.target.value as 'Klasik'|'Yıldırım Turu')}><option>Klasik</option><option>Yıldırım Turu</option></select></label><label>Kategori<select value={category} onChange={event => setCategory(event.target.value)}>{['Genel Kültür','Sinema','Bilim','Tarih','Müzik','Spor'].map(item => <option key={item}>{item}</option>)}</select></label><label>Oyuncu sınırı<select value={limit} onChange={event => setLimit(event.target.value)}>{['4','6','8'].map(item => <option key={item}>{item} oyuncu</option>)}</select></label><button className={`privacy-toggle ${privateRoom ? 'on' : ''}`} onClick={() => setPrivateRoom(value => !value)}><span></span>{privateRoom ? 'Gizli oda · sadece kodla katıl' : 'Açık oda · herkes görebilir'}</button><button className="primary create-submit" onClick={submit}>Odayı Oluştur <span>→</span></button></section></div>
}
function Play({ mode, category, question, questionIndex, totalQuestions, selected, setSelected, intro, state, deadline, answeredCount, eligibleCount, onIntroDone, onLock }: { mode: 'classic' | 'lightning', category: string, question: QuizQuestion, questionIndex: number, totalQuestions: number, selected: string, setSelected: (v:string)=>void, intro: boolean, state?: GameState | null, deadline?: number, answeredCount?: number, eligibleCount?: number, onIntroDone:()=>void, onLock:(secondsRemaining:number)=>void }) {
  const [seconds, setSeconds] = useState(mode === 'lightning' ? 8 : 15)
  const [locked, setLocked] = useState(false)
  const [introSeconds, setIntroSeconds] = useState(intro ? 3 : 0)
  const [lockedPlayers, setLockedPlayers] = useState(3)
  const lockAnswer = () => { if (!selected || locked || intro) return; setLocked(true); if (state?.phase === 'question') { onLock(seconds); return } setLockedPlayers(4) }
  useEffect(() => {
    if (!intro) { setIntroSeconds(0); return }
    setIntroSeconds(3)
    const tick = window.setInterval(() => setIntroSeconds(value => value - 1), 900)
    const finish = window.setTimeout(onIntroDone, 2750)
    return () => { window.clearInterval(tick); window.clearTimeout(finish) }
  }, [intro, onIntroDone])
  useEffect(() => {
    if (!locked) return
    if (state?.phase === 'question') return
    const ready = window.setTimeout(() => setLockedPlayers(6), 520)
    const reveal = window.setTimeout(() => onLock(seconds), 1350)
    return () => { window.clearTimeout(ready); window.clearTimeout(reveal) }
  }, [locked, onLock, state?.phase])
  useEffect(() => {
    const remaining = () => deadline ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : mode === 'lightning' ? 8 : 15
    setSeconds(remaining())
    setLocked(Boolean(state && state.yourChoice !== null))
    setLockedPlayers(3)
    if (intro) return
    const timer = window.setInterval(() => setSeconds(remaining()), 250)
    return () => window.clearInterval(timer)
  }, [mode, intro, deadline, questionIndex, state?.yourChoice])
  useEffect(() => { if (!state && seconds === 0 && !intro && !locked) onLock(0) }, [seconds, intro, locked, onLock, state])
  useEffect(() => { const onKey = (event: KeyboardEvent) => { const key = event.key.toUpperCase(); if (['A','B','C','D'].includes(key) && !locked) setSelected(key); if (event.key === 'Enter' && selected && !locked) lockAnswer() }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey) }, [selected, locked])
  const answers = [['A','Roma'],['B','Parazit'],['C','Amour'],['D','Hayat Güzeldir']]
  const roundSeconds = mode === 'lightning' ? 8 : 15
  const timerRadius = 48
  const timerCircumference = 2 * Math.PI * timerRadius
  const timerProgress = Math.max(0, Math.min(1, seconds / roundSeconds))
  const liveAnswers = question.answers.map((answer, index) => [['A','B','C','D'][index], answer])
  const leftPlayers = players.slice(0, 3)
  const rightPlayers = players.slice(3)
  const seatPalette = ['lavender', 'amber', 'mint', 'rust', 'gold', 'blue', 'sky', 'pink']
  const seatedPlayers = state ? [...state.players].sort((a, b) => a.seat - b.seat) : []
  const seatSplit = Math.ceil(seatedPlayers.length / 2)
  const renderServerPlayer = (player: GameState['players'][number]) => {
    const status = !player.connected ? 'Bağlantı kesildi' : player.waiting ? 'Sonraki turda' : player.answered ? 'Cevabını kilitledi' : 'Cevap bekliyor'
    const statusClass = !player.connected ? 'connecting' : player.answered ? 'self' : 'waiting'
    return <div className={'arena-player-card ' + (player.id === state?.youId ? 'is-self' : '')} key={player.id}>
      <span className={'avatar ' + seatPalette[player.seat % seatPalette.length]}>{player.name.slice(0, 1).toLocaleUpperCase('tr-TR')}</span>
      <div><b>{player.name}{player.id === state?.youId ? ' (sen)' : ''}</b><small className={statusClass}>{status}</small></div>
      <i className={!player.connected ? 'status-offline' : 'status-ready'}>{!player.connected ? '×' : player.answered ? '✓' : '·'}</i>
    </div>
  }
  const playerCard = ([letter, name, color]: string[]) => <div className={'arena-player-card ' + (name === 'Sen' ? 'is-self' : '')} key={name}>
    <span className={'avatar ' + color}>{letter}</span>
    <div><b>{name}</b><small className={name === 'Kaan' ? 'connecting' : name === 'Sen' ? 'self' : 'waiting'}>{name === 'Kaan' ? 'Bağlanıyor' : name === 'Sen' ? 'Sen' : 'Cevap bekliyor'}</small></div>
    <i className={name === 'Kaan' ? 'status-offline' : 'status-ready'}>{name === 'Kaan' ? '×' : '✓'}</i>
  </div>
  return <section className="play-wrap arena-play">
      {intro && <div className="game-intro-overlay" aria-live="polite"><div className="game-intro-orb"><i></i><b>{Math.max(introSeconds, 1)}</b></div><span className="eyebrow">{mode === 'lightning' ? 'YILDIRIM TURU' : 'KLASİK MASA'}</span><h2>Masa hazır.</h2><p>6 oyuncu aynı anda başlıyor</p></div>}
      <div className="arena-topline">
       <b>Soru {questionIndex + 1} <span>/ {totalQuestions}</span></b>
       <div className="segments">{Array.from({length:totalQuestions}).map((_,i)=><i className={i<=questionIndex?'filled':''} key={i}></i>)}</div>
       <span>{answeredCount ?? (locked ? lockedPlayers : 3)} / {eligibleCount ?? 6} kilitledi</span>
    </div>
    <div className="arena-stage">
      <aside className="arena-side arena-left">{state ? seatedPlayers.slice(0, seatSplit).map(renderServerPlayer) : leftPlayers.map(playerCard)}</aside>
      <div className="arena-center">
        <div className={'timer arena-timer timer-ring ' + (seconds <= 5 ? 'urgent' : '')} aria-label={`${seconds} saniye kaldı`}>
          <svg className="timer-ring-svg" viewBox="0 0 112 112" aria-hidden="true"><circle className="timer-ring-track" cx="56" cy="56" r={timerRadius}/><circle className="timer-ring-value" cx="56" cy="56" r={timerRadius} style={{strokeDasharray:timerCircumference,strokeDashoffset:timerCircumference * (1 - timerProgress)}}/></svg>
          <b>{seconds}</b><small>saniye</small>
        </div>
        <div className="question-card card arena-question">
           <span className="pill amber-pill">{question.category}{mode === 'lightning' ? ' · Yıldırım Turu' : ''}</span>
          <h2>{question.prompt}</h2>
           <div className="answers">{liveAnswers.map(([key, text])=><button key={key} className={selected===key?'answer selected': locked ? 'answer locked' : 'answer'} disabled={locked} onClick={()=>setSelected(key)}><span>{key}</span>{text}</button>)}</div>
           <div className={'selection-hint ' + (locked ? 'is-locked' : '')}>{locked ? <><span className="lock-ready-dot"></span>Cevabın kilitlendi · {answeredCount ?? lockedPlayers} / {eligibleCount ?? 6} oyuncu hazır</> : selected ? '● ' + selected + ' seçildi · kilitlemek için hazır' : 'Bir cevap seç'}</div>
           <button className={'lock-button ' + (locked ? 'confirmed' : '')} disabled={!selected || locked} onClick={lockAnswer}><span className="lock-glyph" aria-hidden="true"></span> {locked ? 'Cevabın Kilitlendi' : 'Cevabı Kilitle'}</button>
        </div>
      </div>
      <aside className="arena-side arena-right">{state ? seatedPlayers.slice(seatSplit).map(renderServerPlayer) : rightPlayers.map(playerCard)}</aside>
    </div>
  </section>
}

function ScoreCount({ value }: { value: number }) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    const started = performance.now()
    let frame = 0
    const paint = (now: number) => {
      const progress = Math.min(1, (now - started) / 420)
      setShown(Math.round(value * (1 - Math.pow(1 - progress, 3))))
      if (progress < 1) frame = requestAnimationFrame(paint)
    }
    frame = requestAnimationFrame(paint)
    return () => cancelAnimationFrame(frame)
  }, [value])
  return <>{shown}</>
}

function ServerReveal({ state, question }: { state: GameState; question: QuizQuestion }) {
  const reveal = state.reveal!
  const keys = ['A', 'B', 'C', 'D']
  const correctKey = keys[reveal.correctIndex]
  const selected = state.yourChoice === null ? '' : keys[state.yourChoice]
  const [remaining, setRemaining] = useState(() => Math.max(0, Math.ceil((reveal.until - Date.now()) / 1000)))
  useEffect(() => {
    const sync = () => setRemaining(Math.max(0, Math.ceil((reveal.until - Date.now()) / 1000)))
    sync()
    const timer = window.setInterval(sync, 200)
    return () => window.clearInterval(timer)
  }, [reveal.until])

  const palette = ['lavender', 'amber', 'mint', 'rust', 'gold', 'blue', 'sky', 'pink']
  const seatedPlayers = [...state.players].sort((a, b) => a.seat - b.seat)
  const seatSplit = Math.ceil(seatedPlayers.length / 2)
  const visualById = new Map(seatedPlayers.map((player) => [player.id, {
    letter: player.name.slice(0, 1).toLocaleUpperCase('tr-TR'),
    color: palette[player.seat % palette.length],
    self: player.id === state.youId,
  }]))
  const voters = Object.fromEntries(keys.map((key, index) => [key, (reveal.picks[index] || []).map(id => ({ id, ...visualById.get(id)! })).filter(voter => voter.letter)])) as Record<string, { id: string; letter: string; color: string; self: boolean }[]>
  const myGain = reveal.gains[state.youId] || 0
  const isCorrect = myGain > 0
  const playerCard = (player: GameState['players'][number]) => <div className={'arena-player-card ' + (player.id === state.youId ? 'is-self' : '')} key={player.id}>
    <span className={'avatar ' + palette[player.seat % palette.length]}>{player.name.slice(0, 1).toLocaleUpperCase('tr-TR')}</span>
    <div><b>{player.name}{player.id === state.youId ? ' (sen)' : ''}</b><small>{!player.connected ? 'Bağlantı kesildi' : player.waiting ? 'Sonraki turda' : player.answered ? 'Cevabını kilitledi' : 'Süre doldu'}</small></div>
    <i className={!player.connected ? 'status-offline' : 'status-ready'}>{!player.connected ? '×' : '✓'}</i>
  </div>

  return <section className="play-wrap arena-play arena-reveal">
    <div className="arena-topline"><b>Soru {state.round.index + 1} <span>/ {state.round.total}</span></b><div className="segments">{Array.from({ length: state.round.total }).map((_, index) => <i className={index <= state.round.index ? 'filled' : ''} key={index}></i>)}</div><span>{reveal.picks.flat().length} / {state.eligibleCount} kilitledi</span></div>
    <div className="arena-stage">
      <aside className="arena-side arena-left">{seatedPlayers.slice(0, seatSplit).map(playerCard)}</aside>
      <div className="arena-center">
        <div className="timer arena-timer muted-timer">0<small>saniye</small></div>
        <div className="question-card card arena-question">
          <span className="pill amber-pill">{question.category} · CEVAPLAR AÇILDI</span>
          <h2>{question.prompt}</h2>
          <div className="answers reveal-answers">{question.answers.map((text, index) => {
            const key = keys[index]
            const answerState = key === correctKey ? 'correct' : key === selected ? 'wrong' : 'dim'
            return <div className="answer-slot" key={key}><div className={'answer ' + answerState}><span>{answerState === 'correct' ? '✓' : answerState === 'wrong' ? '×' : key}</span>{text}</div><div className="voter-stack">{voters[key].slice(0, 3).map(voter => <span className={'avatar mini ' + voter.color + (voter.self ? ' self-voter' : '')} key={voter.id}>{voter.letter}</span>)}{voters[key].length > 3 && <span className="avatar mini more">+{voters[key].length - 3}</span>}{voters[key].length > 0 && <small>{voters[key].length} oyuncu</small>}</div></div>
          })}</div>
          <div className={'feedback card ' + (isCorrect ? 'success' : '')}><b>{isCorrect ? '✓ Doğru cevap!' : '× Bu tur olmadı'}</b><span>{isCorrect ? 'Puanın skoruna eklendi' : 'Doğru cevap: '}<span className="accent">{question.answers[reveal.correctIndex]}</span></span><div className="bonus-stack"><strong>+<ScoreCount value={myGain} /> puan</strong>{isCorrect && <small>Sunucu tarafından doğrulandı</small>}</div></div>
          <div className="auto-advance"><span className="advance-dot"></span>Yeni soru <b>{remaining}</b> saniye içinde geliyor · herkes birlikte devam ediyor</div>
        </div>
      </div>
      <aside className="arena-side arena-right">{seatedPlayers.slice(seatSplit).map(playerCard)}</aside>
    </div>
  </section>
}

function Reveal({ onNext, selected, question, questionIndex, totalQuestions, mode, secondsRemaining, correctBefore, votes, revealUntil, serverControlled }: { onNext:()=>void, selected:string, question: QuizQuestion, questionIndex: number, totalQuestions: number, mode: 'classic' | 'lightning', secondsRemaining:number, correctBefore:number, votes:Record<string,string>, revealUntil?: number, serverControlled?: boolean }) {
  const [remaining, setRemaining] = useState(3)
  useEffect(() => {
    const tick = window.setInterval(() => setRemaining(value => Math.max(0, value - 1)), 1000)
    const advance = serverControlled ? undefined : window.setTimeout(onNext, 3400)
    if (revealUntil) setRemaining(Math.max(0, Math.ceil((revealUntil - Date.now()) / 1000)))
    return () => { window.clearInterval(tick); if (advance) window.clearTimeout(advance) }
  }, [onNext, revealUntil, serverControlled])
  const isCorrect = selected === question.correct
  const voters: Record<string, [string, string][]> = {
    A: [], B: [], C: [], D: [],
  }
  Object.entries(votes).forEach(([name, answer]) => {
    const player = players.find(([, playerName]) => playerName === name)
    if (player && voters[answer]) voters[answer].push([player[0], player[2]])
  })
  if (selected) voters[selected] = [['S', 'lavender'], ...voters[selected]]
  const answerData = [
    ['A', 'Roma', selected === 'A' ? 'wrong' : 'dim'],
    ['B', 'Parazit', 'correct'],
    ['C', 'Amour', selected === 'C' ? 'wrong' : 'dim'],
    ['D', 'Hayat Güzeldir', selected === 'D' ? 'wrong' : 'dim'],
  ]
  const liveAnswerData = question.answers.map((text, index) => {
    const key = ['A', 'B', 'C', 'D'][index]
    return [key, text, key === question.correct ? 'correct' : selected === key ? 'wrong' : 'dim']
  })
  const earnedPoints = isCorrect ? (mode === 'lightning' ? 360 : 260) + Math.round(secondsRemaining * (mode === 'lightning' ? 35 : 22)) + (correctBefore >= 3 ? 80 : 0) : 0
  const revealPlayers = players.map(([letter, name, color]: string[]) => <div className={'arena-player-card ' + (name === 'Sen' ? 'is-self' : '')} key={name}>
    <span className={'avatar ' + color}>{letter}</span>
    <div><b>{name}</b><small>{name === 'Kaan' ? 'Bağlanıyor' : name === 'Sen' ? 'Sen' : 'Cevap bekliyor'}</small></div>
    <i className={name === 'Kaan' ? 'status-offline' : 'status-ready'}>{name === 'Kaan' ? '×' : '✓'}</i>
  </div>)
  return <section className="play-wrap arena-play arena-reveal">
    <div className="arena-topline">
      <b>Soru {questionIndex + 1} <span>/ {totalQuestions}</span></b>
      <div className="segments">{Array.from({length:totalQuestions}).map((_,i)=><i className={i<=questionIndex?'filled':''} key={i}></i>)}</div>
      <span>{Object.keys(votes).length + (selected ? 1 : 0)} / 6 kilitledi</span>
    </div>
    <div className="arena-stage">
      <aside className="arena-side arena-left">{revealPlayers.slice(0, 3)}</aside>
      <div className="arena-center">
        <div className="timer arena-timer muted-timer">0<small>saniye</small></div>
        <div className="question-card card arena-question">
           <span className="pill amber-pill">{question.category} · {selected ? 'CEVAPLAR AÇILDI' : 'SÜRE DOLDU'}</span>
          <h2>{question.prompt}</h2>
          <div className="answers reveal-answers">{liveAnswerData.map(([key, text, state]) => <div className="answer-slot" key={key}><div className={'answer ' + state}><span>{state === 'correct' ? '✓' : state === 'wrong' ? '×' : key}</span>{text}</div><div className="voter-stack">{voters[key].slice(0, 3).map(([letter, color]) => <span className={'avatar mini ' + color + (letter === 'S' ? ' self-voter' : '')} key={letter}>{letter}</span>)}{voters[key].length > 3 && <span className="avatar mini more">+{voters[key].length - 3}</span>}{voters[key].length > 0 && <small>{voters[key].length} oyuncu</small>}</div></div>)}</div>
          <div className={'feedback card ' + (isCorrect ? 'success' : '')}><b>{isCorrect ? '✓  Doğru cevap!' : '×  Bu tur olmadı'}</b><span>{isCorrect ? 'Hızın puan getirdi' : 'Doğru cevap: '}<span className="accent">{question.answers[['A','B','C','D'].indexOf(question.correct)]}</span></span><div className="bonus-stack"><strong>+{earnedPoints} puan</strong>{isCorrect && <small>Hız bonusu dahil · seri korunuyor</small>}</div></div>
          <div className="auto-advance"><span className="advance-dot"></span>Yeni soru <b>{remaining}</b> saniye içinde geliyor · herkes birlikte devam ediyor</div>
        </div>
      </div>
      <aside className="arena-side arena-right">{revealPlayers.slice(3)}</aside>
    </div>
  </section>
}function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [sound, setSound] = useState(true)
  const [notifications, setNotifications] = useState(true)
  const [motion, setMotion] = useState(true)
  return <div className="overlay" onClick={onClose}><section className="settings-panel card" onClick={event => event.stopPropagation()}>
    <button className="modal-close" onClick={onClose} aria-label="Kapat">×</button>
    <span className="pill amber-pill">KİŞİSELLEŞTİR</span><h2>Ayarlar</h2><p className="settings-subtitle">Triviara deneyimini kendine göre düzenle.</p>
    <div className="settings-account"><span className="avatar lavender">S</span><div><b>sen#1234</b><small>Discord bağlı</small></div><span className="connected-dot"></span></div>
    <div className="settings-list"><div><span><b>Bildirimler</b><small>Rövanş ve lig güncellemelerini al</small></span><button className={'toggle ' + (notifications ? 'on' : '')} onClick={() => setNotifications(value => !value)}><i></i></button></div><div><span><b>Oyun sesleri</b><small>Kilit, doğru cevap ve süre sesleri</small></span><button className={'toggle ' + (sound ? 'on' : '')} onClick={() => setSound(value => !value)}><i></i></button></div><div><span><b>Hareketli efektler</b><small>Meteor ve parçacık animasyonları</small></span><button className={'toggle ' + (motion ? 'on' : '')} onClick={() => setMotion(value => !value)}><i></i></button></div></div>
    <button className="settings-action">Discord hesabını yönet <span>›</span></button><button className="settings-close" onClick={onClose}>Kaydet ve Kapat</button>
  </section></div>
}
function ActiveRoomModal({ onClose, state, connectionStatus, onReady, onStart, onStartDemo, onAddBot }: { onClose: () => void; state: GameState | null; connectionStatus: string; onReady: (value: boolean) => void; onStart: () => void; onStartDemo: () => void; onAddBot: () => void }) {
  const self = state?.players.find(player => player.id === state.youId)
  const connected = state?.players.filter(player => player.connected) ?? []
  const allReady = connected.length > 0 && connected.every(player => player.ready)
  const isHost = Boolean(state && state.hostId === state.youId)
  const canStart = Boolean(state && state.phase === 'lobby' && isHost && allReady && connected.length >= state.minPlayers)
  const isLocalPreview = connectionStatus !== 'connected'
  if (isLocalPreview) return <div className="overlay" onClick={onClose}><section className="room-modal card active-room-modal local-demo-room" onClick={event => event.stopPropagation()}>
    <button className="modal-close" onClick={onClose} aria-label="Kapat">×</button>
    <span className="eyebrow">YEREL DENEME</span>
    <h2>Deneme masası hazır</h2>
    <p className="active-room-sub">Sunucuya bağlanmadan soru ekranını, cevap kilitleme akışını ve sonuç görünümünü test edebilirsin.</p>
    <div className="room-code"><small>DENEME MODU</small><b>YEREL-01</b><button onClick={() => navigator.clipboard?.writeText('YEREL-01')}>Kopyala</button></div>
    <div className="room-section-head"><h3>Oyuncular <span>1 / 1</span></h3><small>Tek kişilik önizleme</small></div>
    <div className="room-ready-summary"><span><i></i> 1 oyuncu hazır</span><small>Masa başlayabilir</small></div>
    <div className="room-player-list"><div className="room-player"><span className="avatar mini mint">S</span><b>Sen (deneme)</b><small>Yerel oyuncu</small><span className="ready-state">Hazır</span></div></div>
    <div className="room-actions"><button className="primary local-demo-start" onClick={onStartDemo}>Deneme maçını başlat <span>→</span></button></div>
    <p className="room-ready-help">Bu seçenek yalnızca bağlantı kurulamadığında görünür. Gerçek oda akışı değişmez.</p>
  </section></div>
  const statusText = connectionStatus === 'connected' ? 'Canlı bağlantı' : connectionStatus === 'reconnecting' ? 'Yeniden bağlanıyor' : 'Bağlantı bekleniyor'
  return <div className="overlay" onClick={onClose}><section className="room-modal card active-room-modal" onClick={event => event.stopPropagation()}>
    <button className="modal-close" onClick={onClose} aria-label="Kapat">×</button>
    <span className="eyebrow">ODA DURUMU</span>
    <h2>{state ? `Masa ${state.roomId}` : 'Odaya bağlanılıyor'}</h2>
    <p className="active-room-sub">{statusText}. Herkes hazır olduğunda oda sahibi maçı başlatabilir.</p>
    <div className="room-code"><small>ODA KODU</small><b>{state?.roomId?.toUpperCase() || '—'}</b><button onClick={() => navigator.clipboard?.writeText(state?.roomId || '')}>Kopyala</button></div>
    <div className="room-section-head"><h3>Oyuncular <span>{connected.length} / 8</span></h3><small>{isHost ? 'Oda sahibi sensin' : 'Oda sahibi bekleniyor'}</small></div>
    <div className="room-ready-summary"><span><i></i> {connected.filter(player => player.ready).length} oyuncu hazır</span><small>{allReady ? 'Masa başlayabilir' : 'Hazır olmayan oyuncular bekleniyor'}</small></div>
    <div className="room-player-list">{state?.players.map(player => <div className="room-player" key={player.id}>
      <span className="avatar mini mint">{player.name.slice(0, 1).toUpperCase()}</span><b>{player.name}{player.id === state.youId ? ' (sen)' : ''}</b>
      {player.id === state.hostId && <small>Oda sahibi</small>}
      <span className={!player.connected ? 'waiting-state' : player.ready ? 'ready-state' : 'waiting-state'}>{!player.connected ? 'Bağlantı yok' : player.ready ? 'Hazır' : 'Bekliyor'}</span>
    </div>) || <p className="empty-notice">Oda bilgisi alınıyor.</p>}</div>
    <div className="room-actions">
      <button className={self?.ready ? 'secondary ready-button' : 'secondary'} disabled={!self || state?.phase !== 'lobby'} onClick={() => onReady(!self?.ready)}>{self?.ready ? 'Hazır değilim' : 'Hazırım'}</button>
      {isHost ? <button className="primary" disabled={!canStart} onClick={onStart}>Maçı Başlat <span>→</span></button> : <button className="primary" disabled>Oda sahibini bekle</button>}
    </div>
    {isHost && state?.devMode && connected.length < state.minPlayers && <button className="room-dev-bot" onClick={onAddBot}>Test için bot ekle</button>}
    {!canStart && isHost && state && <p className="room-ready-help">Başlatmak için en az {state.minPlayers} bağlı oyuncu ve herkesin hazır onayı gerekli.</p>}
  </section></div>
}

function RoomModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'create' | 'join'>('create')
  const [mode, setMode] = useState<'lightning' | 'classic'>('lightning')
  const [maxPlayers, setMaxPlayers] = useState(4)
  const [privateRoom, setPrivateRoom] = useState(false)
  const [created, setCreated] = useState(false)
  const code = 'XYZ123'
  return <div className="overlay" onClick={onClose}><section className="room-modal card" onClick={event => event.stopPropagation()}>
    <button className="modal-close" onClick={onClose} aria-label="Kapat">×</button>
    <h2><span className="accent">Triviara</span> Oda Yönetim Paneli</h2>
    <div className="modal-tabs"><button className={tab === 'create' ? 'active' : ''} onClick={() => setTab('create')}>Oda Oluştur</button><button className={tab === 'join' ? 'active' : ''} onClick={() => setTab('join')}>Odaya Katıl</button></div>
    {tab === 'create' ? <div className="room-form">
      <div className="room-form-left"><h3>Mod Seçimi</h3><div className="mode-switch"><button className={mode === 'lightning' ? 'selected' : ''} onClick={() => setMode('lightning')}>ϟ&nbsp; Yıldırım Turu</button><button className={mode === 'classic' ? 'selected' : ''} onClick={() => setMode('classic')}>☷&nbsp; Klasik</button></div><h3>Kategori Seçimi</h3><button className="select-like">Sinema, Bilim, etc. <span>⌄</span></button><h3>Oyuncu Sınırı</h3><input className="range" type="range" min="2" max="6" value={maxPlayers} onChange={event => setMaxPlayers(Number(event.target.value))} /><div className="range-labels"><span>2</span><span>3</span><b>{maxPlayers}</b><span>5</span><span>6</span></div><div className="private-row"><span>Gizli Oda <small>?</small></span><button className={'toggle ' + (privateRoom ? 'on' : '')} onClick={() => setPrivateRoom(value => !value)}><i></i></button></div><button className="create-room" onClick={() => setCreated(true)}>Odayı Oluştur</button></div>
      <div className="room-form-right"><h3>Oda Kodu</h3><div className="code-row"><span>{created ? code.slice(0, 2) : '6 7'}</span><em>-</em><span>{created ? code.slice(2, 4) : '2 3'}</span><button>Katıl</button></div><hr /><h3>Son Katıldığın Odalar</h3><div className="face-row"><span className="avatar mini mint">E</span><span className="avatar mini blue">B</span><span className="avatar mini gold">Z</span><span className="avatar mini lavender">S</span><button>＋</button></div><h3>Arkadaşlarının Odaları</h3><div className="face-row"><span className="avatar mini mint">E</span><span className="avatar mini pink">J</span><span className="avatar mini amber">K</span><span className="avatar mini blue">R</span><button>＋</button></div>{created && <div className="room-success"><b>✓ Başarılı</b> Oda oluşturuldu · <strong>{code}</strong><button>Discord'da Paylaş</button></div>}</div>
    </div> : <div className="join-form"><h3>Oda kodunu gir</h3><input placeholder="Örn. XYZ123" maxLength={6} /><button className="create-room">Odaya Katıl</button><p>Arkadaşından aldığın 6 haneli kodu girerek katıl.</p></div>}
  </section></div>
}

function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState(['invite','blue','purple','cyan','gold'])
  const remove = (id: string) => setItems(value => value.filter(item => item !== id))
  return <div className="notification-panel card"><div className="notification-head"><h2>Bildirimler</h2><button onClick={() => { setItems([]); onClose() }}>Tümünü Oku</button></div>{items.includes('invite') && <div className="notification-item invite"><span className="avatar amber">B</span><div><b>Baran rövanş istiyor</b><small>Az önce</small><div><button className="accept" onClick={() => remove('invite')}>Katıl</button><button className="reject" onClick={() => remove('invite')}>Reddet</button></div></div></div>}{items.includes('blue') && <div className="notification-item blue"><span className="notice-icon">↑</span><div><b>Elif seni Haftalık Lig’de geçti</b><button className="notice-action" onClick={() => remove('blue')}>Görüntüle</button></div></div>}{items.includes('purple') && <div className="notification-item purple"><span className="notice-icon">▣</span><div><b>Günün Kategorisi: Sinema</b><strong>x2 Puan</strong></div></div>}{items.includes('cyan') && <div className="notification-item cyan"><span className="notice-icon">ϟ</span><div><b>Yıldırım Turu lobin hazır</b><button className="accept" onClick={() => remove('cyan')}>Katıl</button></div></div>}{items.includes('gold') && <div className="notification-item gold"><span className="notice-icon">♛</span><b>Seviye 28’e ulaştın</b></div>}{items.length === 0 && <p className="empty-notice">Tüm bildirimler okundu.</p>}</div>
}
function History() {
  const matches = [['Yıldırım Turu','Sinema','24.05.2024','850 Puan','8/10 Doğru','Galibiyet','win'],['Klasik Mod','Tarih','23.05.2024','420 Puan','5/10 Doğru','Mağlubiyet','loss'],['Yıldırım Turu','Bilim','21.05.2024','710 Puan','7/10 Doğru','Galibiyet','win']]
  return <section className="history-page"><div className="history-grid"><div className="history-list card"><div className="panel-title"><h2>Maç Geçmişi</h2><button className="ghost-button">Tümünü Gör</button></div>{matches.map(([mode,category,date,score,correct,result,state]) => <button className={`history-match ${state}`} key={date}><span className="history-mode">{mode}</span><b>{category}</b><small>{date}</small><div><strong>{score}</strong><span> · {correct}</span><em>{result}</em></div></button>)}</div><div className="analysis-panel card"><div className="panel-title"><h2>Analiz</h2><span className="pill cool-pill">SON OYUN</span></div><h3>Soru 1: Kırmızı Gezegen?</h3><p className="analysis-line">✓ Doğru Cevap: <b>Mars</b></p><p className="analysis-line">✓ Senin Cevabın: <b>Mars</b></p><p className="analysis-line">◷ Cevaplama Hızı: <b>1,2 sn</b></p><div className="answer-chart"><h3>Diğer Oyuncular</h3>{[['Mars','60%','high'],['Venüs','20%','mid'],['Jüpiter','10%','low'],['Satürn','10%','low']].map(([name,value,height]) => <div className={`bar ${height}`} key={name}><b>{value}</b><i></i><small>{name}</small></div>)}</div><h3>Kazanımlar</h3><p className="reward-line">🏆 Hız Bonusu <b>+50 Puan</b></p><p className="reward-line">🏆 Seri Bonusu <b>+100 Puan</b></p><button className="primary wide-button">Sonuçları Discord'da Paylaş</button></div></div></section>
}

function SocialHub({ onPlay, onOpenRoom }: { onPlay:(mode:'classic'|'lightning')=>void,onOpenRoom:()=>void }) {
  return <section className="social-page"><div className="social-grid"><div className="social-panel card"><h2>Aktif Meydan Okumalar</h2>{[['Baran','Genel Kültür','12s kaldı'],['Elif','Sinema kategorisinde geçti','2dk kaldı'],['Zeynep','5 soruluk Yıldırım Turu başlattı','58s kaldı']].map(([name,text,time])=><div className="challenge" key={name}><span className="avatar amber">{name[0]}</span><div><b>{name} <small>{text}</small></b><span>{time}</span></div><button className="secondary">Katıl</button><button className="ghost-button">Reddet</button></div>)}</div><div className="social-panel card"><h2>Çevrimiçi Arkadaşlar</h2>{players.map(([letter,name,color])=><div className="friend-row" key={name}><span className={`avatar mini ${color}`}>{letter}</span><b>{name}</b><small><i className="online-dot"></i> Odada</small><button className="secondary" onClick={() => onPlay('classic')}>Meydan Oku</button></div>)}</div><div className="social-panel card create-panel"><h2>Oda Oluştur</h2><div className="social-setting"><span>Oyun Modu</span><button onClick={() => onPlay('lightning')}>Yıldırım Turu <b>↔</b> Klasik</button></div><div className="social-setting"><span>Oda Gizliliği</span><button>Açık <b>↔</b> Gizli</button></div><label><input type="checkbox" /> Discord ses kanalına davet</label><input placeholder="Oda kodu (opsiyonel)" /><button className="primary wide-button" onClick={onOpenRoom}>Odayı Oluştur</button></div></div><div className="state-grid"><div className="state-card card"><strong>⌕</strong><b>Henüz kimse masada değil</b><button className="secondary">Arkadaş Davet Et</button></div><div className="state-card card"><strong className="cyan-icon">◌</strong><b>Oyuncular aranıyor…</b><button className="ghost-button">İptal Et</button></div><div className="state-card card error"><strong>⚠</strong><b>Discord bağlantısı kesildi</b><button className="secondary">Yeniden Bağlan</button></div><div className="state-card card"><strong>⇥</strong><b>Oda bulunamadı veya süresi dolmuş</b><button className="ghost-button">Lobiye Dön</button></div><div className="state-card card"><strong>♙</strong><b>Arkadaş listesi boş</b><small>Henüz burada bir şey yok</small></div><div className="state-card card"><strong>◷</strong><b>Maç geçmişi boş</b><small>Henüz burada bir şey yok</small></div></div></section>
}

function Tasks() {
  const [rewardClaimed, setRewardClaimed] = useState(false)
  const rows=[
    {title:'Sinema kategorisinde 3 maç oyna',reward:'100 XP · 50 Altın',count:'2/3',progress:66},
    {title:'5 cevabı 5 saniyeden kısa sürede kilitle',reward:'150 XP · 75 Altın',count:'3/5',progress:60},
    {title:'Bir arkadaşına meydan oku',reward:'200 XP · 100 Altın',count:'0/1',progress:0},
    {title:'Yıldırım Turu kazan',reward:'300 XP · 150 Altın',count:'Tamamlandı',progress:100},
  ]
  return <section className="tasks-page">
    <div className="tasks-banner card" style={{backgroundImage:`url(${tasksBanner})`}}><div><span className="pill cool-pill">GÜNLÜK GÖREVLER</span><h2>Bugünün meydan okumaları</h2><p>Görevleri tamamla, XP ve altın topla.</p></div><div className="tasks-banner-score"><b>250</b><small>BUGÜN XP</small></div></div>
    <div className="task-summary-grid">
      <section className="daily-strip card"><span className="summary-icon">↻</span><div><small>GÖREVLERİN YENİLENMESİ</small><b>02s 45d 15sn</b><p>Haftalık görevler <strong>5/10</strong></p></div></section>
      <section className="streak-card card"><div><small>AKTİF SERİ</small><b>7 günlük seri</b><p>Bugün tamamla, seriyi koru.</p></div><div className="streak-row" aria-label="7 günlük seri">{Array.from({length:7}).map((_,i)=><i className={i===6?'active':''} key={i}>✓</i>)}</div></section>
    </div>
    <div className="task-list">{rows.map(({title,reward,count,progress},i)=><div className={`task-row card ${progress >= 60 && progress < 100 ? 'near-complete' : ''} ${progress===100?'completed':''} ${progress===100 && rewardClaimed?'claimed':''}`} key={title}><span className="task-icon">{i===0?'▣':i===1?'♛':i===2?'⚔':'✦'}</span><div><h3>{title}</h3><p>Ödül: <b>{reward}</b></p><div className="task-progress" aria-label={`Görev ilerlemesi yüzde ${progress}`}><i style={{width:`${progress}%`}}></i></div></div><strong>{progress===100 && rewardClaimed ? 'Alındı' : count}</strong>{progress===100&&!rewardClaimed&&<button className="primary reward-button" onClick={() => setRewardClaimed(true)}>Ödülü Al</button>}{progress===100&&rewardClaimed&&<span className="claimed-badge">✓ Ödül alındı</span>}</div>)}</div>
  </section>
}

function Tournament({ onPlay }: { onPlay:()=>void }) {
  const [activeView, setActiveView] = useState('Genel Bakış')
  const [isRegistered, setIsRegistered] = useState(false)
  const [reminderOn, setReminderOn] = useState(false)
  const rounds = [
    { title:'Grup Aşaması', games:[['Elif','3','Mert','1'],['Sen','2','Ahmet','1'],['Baran','3','Zeynep','0'],['Kaan','2','Selen','1']] },
    { title:'Yarı Final', games:[['Elif','-','Sen','-'],['Baran','-','Kaan','-']] },
    { title:'Final', games:[['Kazanan bekleniyor','-','Kazanan bekleniyor','-']] }
  ]
  const registeredCount = isRegistered ? 25 : 24
  const tournamentCapacity = 32
  const registrationPercent = Math.round((registeredCount / tournamentCapacity) * 100)
  return <section className="tournament-page tournament-hub">
    <header className="tournament-hub-hero card" style={{backgroundImage:`url(${tournamentCosmicArena})`}}>
      <div className="tournament-hero-copy"><span className="eyebrow">HAFTALIK TURNUVA</span><div className="tournament-live-line"><i></i> Kayıtlar açık <span>Başlamasına 2 sa 15 dk</span></div><h2>Sinema Gecesi</h2><p>Bilgini bracket boyunca taşı, finalde rakiplerini geride bırak ve büyük ödül havuzundan payını al.</p><div className="tournament-hero-meta"><span>32 oyuncu</span><span>3 tur</span><span>Sinema kategorisi</span></div></div>
      <div className="tournament-prize-stack"><small>ÖDÜL HAVUZU</small><b>50.000</b><strong>altın</strong><span>Efsanevi Sinema rozeti</span></div>
    </header>
    <nav className="tournament-view-tabs" aria-label="Turnuva bölümleri">{['Genel Bakış','Turnuva Ağacı','Canlı Maçlar','Ödüller'].map(item=><button key={item} className={activeView===item?'active':''} onClick={() => setActiveView(item)}>{item}</button>)}</nav>
    {activeView !== 'Ödüller' && <div className="tournament-command-grid">
      <section className="tournament-entry card"><div><span className="eyebrow">SENİN DURUMUN</span><h3>{isRegistered ? 'Turnuvada yerin ayrıldı.' : 'Arenaya çıkmaya hazır mısın?'}</h3><p>{isRegistered ? 'Eşleşmen açıklandığında burada göreceksin.' : <>Giriş ücreti <b>150 altın</b> · Kayıt sonrası eşleşmen otomatik belirlenir.</>}</p></div><div className="entry-status"><span>{registeredCount} / {tournamentCapacity}</span><small>oyuncu kayıtlı</small><div className="tournament-capacity" role="progressbar" aria-label="Turnuva kayıt doluluğu" aria-valuemin={0} aria-valuemax={tournamentCapacity} aria-valuenow={registeredCount}><i style={{width:`${registrationPercent}%`}}></i></div></div><button className={isRegistered ? 'secondary' : 'primary'} onClick={() => isRegistered ? onPlay() : setIsRegistered(true)}>{isRegistered ? 'Maça Hazırlan' : 'Turnuvaya Katıl'} <span>→</span></button></section>
      <section className="next-match card"><span className="eyebrow">SONRAKİ MAÇIN</span><div className="next-match-row"><span className="avatar lavender">S</span><strong>{isRegistered ? 'Eşleşme bekleniyor' : 'Rakip bekleniyor'}</strong><b>20:00</b></div><p>Katılımınla birlikte ilk eşleşmen burada görünür.</p><button className="quiet-button" onClick={() => setReminderOn(value => !value)}>{reminderOn ? 'Hatırlatıcı açık ✓' : 'Hatırlatıcıyı aç'}</button></section>
    </div>}
    {(activeView === 'Genel Bakış' || activeView === 'Turnuva Ağacı') && <div className="tournament-content-grid">
      <section className="bracket-board card"><div className="tournament-panel-head"><div><span className="eyebrow">EŞLEŞME TAKİBİ</span><h3>Turnuva Ağacı</h3></div><span className="panel-status"><i></i> Canlı güncelleniyor</span></div><div className="bracket-rounds">{rounds.map((round,roundIndex)=><div className={`bracket-round round-${roundIndex}`} key={round.title}><h4>{round.title}</h4><div className="round-games">{round.games.map(([one,oneScore,two,twoScore],gameIndex)=><article className={`bracket-game ${one==='Sen'||two==='Sen'?'is-self':''} ${roundIndex===2?'is-final':''}`} key={`${round.title}-${gameIndex}`}><div><span>{one}</span><b>{oneScore}</b></div><div><span>{two}</span><b>{twoScore}</b></div>{roundIndex===0&&gameIndex===1&&<small>Sıradaki maçın</small>}</article>)}</div></div>)}</div><div className="bracket-note"><span></span><b>Senin yolun:</b> Grup maçını geç, yarı finale yüksel ve finalde 50.000 altın için oyna.</div></section>
      <aside className="tournament-rail"><section className="tournament-leaders card"><div className="tournament-panel-head"><div><span className="eyebrow">CANLI SIRALAMA</span><h3>Turnuva Liderleri</h3></div><button>Tümü</button></div><div className="mini-podium"><div><span className="avatar amber">B</span><b>Baran</b><small>2.</small></div><div className="is-leading"><span className="avatar mint">E</span><b>Elif</b><small>1.</small></div><div><span className="avatar lavender">S</span><b>Sen</b><small>3.</small></div></div><div className="leader-compact-list">{[['4','Kaan','6.100','rust'],['5','Zeynep','5.420','gold'],['6','Mert','4.990','blue']].map(([rank,name,score,color])=><div key={rank}><b>{rank}</b><span className={`avatar mini ${color}`}>{name[0]}</span><strong>{name}</strong><em>{score}</em></div>)}</div></section><section className="tournament-rewards card"><span className="eyebrow">ÖDÜL ROTASI</span><div><b>İlk 3</b><span>Altın, XP ve özel rozet</span></div><i><em></em></i><small>Sen şu an 3. sıradasın · 280 puanla 2. sıraya çıkarsın.</small></section></aside>
    </div>}
    {(activeView === 'Genel Bakış' || activeView === 'Canlı Maçlar') && <section className="live-matches-section"><div className="tournament-panel-head"><div><span className="eyebrow">ŞU AN ARENADA</span><h3>Canlı Karşılaşmalar</h3></div><button className="quiet-button">Tüm maçları izle</button></div><div className="live-match-grid">{[['Sinema Klasikleri','Elif','Baran','7 / 10','8 / 10'],['Yıldırım Sinema','Kaan','Zeynep','4 / 5','3 / 5'],['Ödül Turu','Mert','Selen','5 / 10','5 / 10']].map(([category,one,two,oneScore,twoScore],index)=><article className="live-match-card card" key={category}><div className="live-match-top"><span>CANLI</span><small>{category}</small></div><div className="live-duel"><b>{one}</b><strong>{oneScore}</strong><i></i><strong>{twoScore}</strong><b>{two}</b></div><div className="live-match-foot"><span>{index===0?'Son soru':'Soru 4'}</span><button>İzle →</button></div></article>)}</div></section>}
    {activeView === 'Ödüller' && <section className="tournament-reward-view card"><div className="tournament-panel-head"><div><span className="eyebrow">ÖDÜL MERKEZİ</span><h3>Sinema Gecesi ödülleri</h3></div><span className="panel-status"><i></i> Katılım ödülleri açık</span></div><div className="reward-tier-grid">{[['1. sıra','50.000','Efsanevi Sinema rozeti'],['2. sıra','25.000','Finalist rozeti'],['3. sıra','12.500','Arena madalyası']].map(([rank,amount,label])=><article className="reward-tier" key={rank}><span>{rank}</span><b>{amount}</b><small>altın</small><p>{label}</p></article>)}</div><div className="reward-footnote">Her turda puan kazanırsın. İlk üçte bitiren oyuncular ödül havuzundan pay alır.</div></section>}
  </section>
}

function GuideIcon({ kind }: { kind: 'table' | 'choice' | 'lock' | 'reveal' }) {
  const paths = {
    table: <><path d="M7 10h34l-4 8H11l-4-8Z"/><path d="M14 18 10 31M34 18l4 13M24 18v13"/><circle cx="14" cy="7" r="3"/><circle cx="34" cy="7" r="3"/></>,
    choice: <><circle cx="24" cy="24" r="17"/><path d="m16 24 5 5 11-12"/><path d="M9 38h30"/></>,
    lock: <><rect x="10" y="21" width="28" height="20" rx="4"/><path d="M16 21v-5a8 8 0 0 1 16 0v5M24 28v7"/></>,
    reveal: <><path d="M5 24s7-11 19-11 19 11 19 11-7 11-19 11S5 24 5 24Z"/><circle cx="24" cy="24" r="5"/><path d="m31 38 5 5 8-9"/></>,
  }
  return <svg className="guide-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>
}

function HowTo({ onPlay }: { onPlay:()=>void }) {
  const steps: Array<{number:string; title:string; text:string; kind:'table'|'choice'|'lock'|'reveal'; detail:string}> = [
    { number:'01', title:'Masaya katıl', text:'Açık bir lobi seç veya kendi odanı kur.', kind:'table', detail:'2–8 oyuncu' },
    { number:'02', title:'Cevabını seç', text:'Süre dolmadan dört şıktan birini işaretle.', kind:'choice', detail:'15 saniye' },
    { number:'03', title:'Cevabını kilitle', text:'Seçimin kesinleşir; herkes aynı anda bekler.', kind:'lock', detail:'Geri alınamaz' },
    { number:'04', title:'Masayı oku', text:'Reveal anında kimin hangi şıkkı seçtiğini gör.', kind:'reveal', detail:'Hep birlikte' },
  ]
  return <section className="howto-page">
    <header className="howto-banner card" style={{backgroundImage:`url(${howToBanner})`}}>
      <div><span className="pill cool-pill">QUIZTAVERN REHBERİ</span><h2>Birlikte oyna,<br/><span>birlikte keşfet.</span></h2><p>Triviara tek kişilik bir test değil: seç, kilitle ve masadaki herkesi aynı anda oku.</p></div>
      <div className="howto-banner-note"><b>01 — 04</b><span>Bir maçın akışı</span></div>
    </header>
    <section className="guide-journey card">
      <div className="guide-journey-head"><div><span className="eyebrow">OYUN AKIŞI</span><h3>Her soruda aynı ritim</h3></div><p>Seçimlerin görünmeden önce saklı kalır; süre bittiğinde masa bir anda canlanır.</p></div>
      <div className="guide-steps">{steps.map((step, index) => <article className="guide-step" key={step.number}>
        <div className="guide-step-top"><span>{step.number}</span><GuideIcon kind={step.kind}/></div>
        <h4>{step.title}</h4><p>{step.text}</p><small>{step.detail}</small>{index < steps.length - 1 && <i className="guide-connector" aria-hidden="true"/>}
      </article>)}</div>
      <div className="guide-reveal-demo"><div className="demo-answer correct"><b>B</b><span>Parazit</span><div className="demo-avatars"><i>S</i><i>E</i><i>B</i><em>+2</em></div></div><div><b>Reveal anı</b><span>Seçen oyuncular, seçtikleri şıkkın altında görünür.</span></div></div>
    </section>
    <section className="mode-intro"><div><span className="eyebrow">MODUNU SEÇ</span><h3>Her masa aynı hızda değil.</h3></div><p>Klasik tempoda düşün veya kısa Yıldırım Turu’nda reflekslerini konuştur.</p></section>
    <div className="mode-cards guide-mode-cards">{[['Klasik Masa','10 soru · 15 saniye','Düşünmek için daha çok zaman.'],['Yıldırım Turu','5 soru · 8 saniye','Kısa, hızlı ve yüksek tempolu.'],['Son Kalan','Elimination','Her yanlışta gerilim artar.'],['Takım Savaşı','Ekip oyunu','Puanları birlikte toplayın.']].map(([title,meta,text],index)=><article className={`mode-card card mode-${index}`} key={title}><span className="mode-index">0{index + 1}</span><b>{title}</b><small>{meta}</small><p>{text}</p></article>)}</div>
    <button className="primary start-button" onClick={onPlay}>İlk Maçını Başlat <span>→</span></button>
  </section>
}

function Profile() {
  const favorites=[['S','Sinema','92','cinema'],['B','Bilim','74','science'],['T','Tarih','65','history']]
  const history=[['Sinema Gecesi','3. Sıra','500'],['Haftalık Klasik','1. Sıra','2000'],['Yıldırım Turu','5. Sıra','100']]
  return <section className="profile-dashboard">
    <header className="profile-heading"><div><span className="eyebrow">OYUNCU MERKEZİ</span><h2>Oyuncu İstatistikleri</h2><p>Performansını analiz et ve zirveye tırman.</p></div><div className="profile-heading-chip"><span className="profile-chip-dot"></span> Discord bağlı</div></header>
    <div className="profile-dashboard-grid">
      <aside className="profile-sidebar"><section className="profile-identity card"><div className="profile-emblem-wrap"><img src={profileEmblem} alt="Triviara profil amblemi" /></div><h3>sen#1234</h3><b>Usta Gözlemci</b><div className="profile-level"><div><span>Seviye 27</span><strong>2.450 / 3.000 XP</strong></div><i><em></em></i></div><div className="profile-stat-line"><span>Bu hafta</span><strong>+640 XP</strong></div></section><section className="performance-card card"><small>GENEL PERFORMANS</small><div className="performance-metrics"><div><span className="metric-mark">01</span><b>142</b><p>Toplam Oyun</p></div><div><span className="metric-mark">%</span><b>%78</b><p>Doğruluk Oranı</p></div><div><span className="metric-mark">↗</span><b>%62</b><p>Kazanma Oranı</p></div></div></section></aside>
      <div className="profile-content"><section className="favorite-categories card"><div className="profile-panel-head"><div><span className="eyebrow">PERFORMANS HARİTASI</span><h3>Favori Kategoriler</h3></div><button>Tümünü Gör</button></div>{favorites.map(([mark,name,value,kind])=><div className={`favorite-row ${kind}`} key={name}><span className={`category-mark ${kind}`}>{mark}</span><div><b>{name}</b><i><em style={{width:`${value}%`}}></em></i></div><strong>%{value}</strong></div>)}</section><section className="achievement-card card"><div className="profile-panel-head"><div><span className="eyebrow">ROZET KOLEKSİYONU</span><h3>Başarıların</h3></div><button>12 rozet</button></div><div className="achievement-art" style={{backgroundImage:`url(${profileAchievements})`}}></div><div className="achievement-labels"><span>Bilim kaşifi</span><span>Sinema gecesi</span><span>Yıldırım ustası</span><span>Lig tacı</span><span>Zirve yönü</span></div></section><section className="tournament-history card"><div className="profile-panel-head"><div><span className="eyebrow">MAÇ KAYITLARI</span><h3>Turnuva Geçmişi</h3></div><button>Tüm geçmişi gör</button></div><div className="history-table-head"><span>TURNUVA</span><span>SIRALAMA</span><span>ÖDÜL</span></div>{history.map(([name,rank,reward])=><div className="tournament-history-row" key={name}><span>{name}</span><b>{rank}</b><strong>{reward} altın</strong></div>)}</section></div>
    </div>
  </section>
}

function CollectionMark({ kind }: { kind: string }) {
  if (kind === 'frame') return <svg viewBox="0 0 120 120" aria-hidden="true"><rect x="14" y="14" width="92" height="92" rx="22" fill="none" stroke="currentColor" strokeWidth="5"/><path d="M30 48V30h18M72 30h18v18M90 72v18H72M48 90H30V72" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round"/></svg>
  if (kind === 'badge') return <svg viewBox="0 0 120 120" aria-hidden="true"><path d="M60 13l10 17 20 2 8 18 17 11-6 19 6 19-17 11-8 18-20 2-10 17-10-17-20-2-8-18-17-11 6-19-6-19 17-11 8-18 20-2z" fill="none" stroke="currentColor" strokeWidth="5"/><circle cx="60" cy="60" r="18" fill="none" stroke="currentColor" strokeWidth="5"/></svg>
  if (kind === 'name') return <svg viewBox="0 0 120 120" aria-hidden="true"><path d="M20 74c10-30 25-42 40-42s30 12 40 42" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round"/><path d="M31 78h58" stroke="currentColor" strokeWidth="5" strokeLinecap="round"/><circle cx="60" cy="43" r="10" fill="none" stroke="currentColor" strokeWidth="5"/></svg>
  return <svg viewBox="0 0 120 120" aria-hidden="true"><path d="M23 35h74v50H23z" fill="none" stroke="currentColor" strokeWidth="5"/><path d="M39 61l12-13 10 9 12-17 12 21" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/><circle cx="42" cy="46" r="4" fill="currentColor"/></svg>
}

function Collection({ coins, owned, equipped, onSpend, onOwn, onEquip }: { coins: number; owned: string[]; equipped: string; onSpend: (amount: number) => void; onOwn: (id: string) => void; onEquip: (id: string) => void }) {
  const items = [
    { id: 'starmap', name: 'Yıldız Haritası', type: 'Çerçeve', kind: 'frame', price: 0, tone: 'cyan', note: 'Başlangıç çerçevesi' },
    { id: 'neonflow', name: 'Neon Akış', type: 'Çerçeve', kind: 'frame', price: 640, tone: 'violet', note: 'Canlı lobilerden ilhamla' },
    { id: 'goldhalo', name: 'Altın Halo', type: 'Çerçeve', kind: 'frame', price: 950, tone: 'gold', note: 'Turnuva ödülü görünümü' },
    { id: 'aurora', name: 'Kutup Işığı', type: 'İsim efekti', kind: 'name', price: 420, tone: 'mint', note: 'İsmin için hafif parıltı' },
    { id: 'bolt', name: 'Yıldırım Rozeti', type: 'Rozet', kind: 'badge', price: 720, tone: 'amber', note: 'Hızlı cevap ustalarına' },
    { id: 'cinema', name: 'Gece Perdesi', type: 'Masa teması', kind: 'theme', price: 1100, tone: 'blue', note: 'Sinema masası için tema' },
  ]
  const [tab, setTab] = useState('Tümü')
  const [notice, setNotice] = useState('')
  const visible = tab === 'Tümü' ? items : items.filter(item => item.type === tab)
  const handleItem = (item: typeof items[number]) => {
    if (owned.includes(item.id)) { onEquip(item.id); setNotice(`${item.name} kuşanıldı.`); return }
    if (coins < item.price) { setNotice('Bu öğe için yeterli altının yok.'); return }
    onOwn(item.id); onSpend(item.price); onEquip(item.id); setNotice(`${item.name} koleksiyonuna eklendi.`)
  }
  return <section className="collection-page">
    <header className="collection-hero card"><div><span className="eyebrow">OYUNCU KOLEKSİYONU</span><h2>Kazandığını <span>kuşan.</span></h2><p>Masada seni ayıran çerçeveleri, rozetleri ve temaları topla.</p></div><div className="collection-wallet"><small>MEVCUT ALTIN</small><b>{coins.toLocaleString('tr-TR')}</b><span>Görevler ve turnuvalardan kazanılır.</span></div></header>
    <div className="collection-layout"><aside className="collection-showcase card"><div className="showcase-orbit"></div><div className={`showcase-profile ${items.find(item => item.id === equipped)?.tone || 'cyan'}`}><span className="avatar lavender">S</span></div><h3>sen#1234</h3><b>{items.find(item => item.id === equipped)?.name}</b><p>Şu an kuşanılan görünüm</p><div className="showcase-stats"><span><b>{owned.length}</b> sahip olunan</span><span><b>12</b> rozet hedefi</span></div></aside><main className="collection-catalog card"><div className="collection-catalog-head"><div><span className="eyebrow">KATALOĞU KEŞFET</span><h3>Görünümünü seç</h3></div><small>{owned.length} / {items.length} öğe</small></div><div className="collection-tabs">{['Tümü','Çerçeve','Rozet','İsim efekti','Masa teması'].map(item => <button className={tab === item ? 'active' : ''} onClick={() => setTab(item)} key={item}>{item}</button>)}</div>{notice && <div className="collection-notice" role="status"><i></i>{notice}</div>}<div className="collection-grid">{visible.map(item => { const isOwned = owned.includes(item.id); const isEquipped = equipped === item.id; return <article className={`collection-item ${item.tone} ${isEquipped ? 'equipped' : ''}`} key={item.id}><div className="collection-preview"><CollectionMark kind={item.kind} /></div><div className="collection-item-top"><span>{item.type}</span>{isEquipped && <b>Kuşanıldı</b>}</div><h4>{item.name}</h4><p>{item.note}</p><button className={isOwned ? 'secondary' : 'primary'} onClick={() => handleItem(item)}>{isOwned ? (isEquipped ? 'Kuşanıldı' : 'Kuşan') : <><strong>{item.price.toLocaleString('tr-TR')}</strong> altın</>}</button></article> })}</div></main></div>
  </section>
}

function GoldGuideModal({ onClose, onNavigate }: { onClose: () => void; onNavigate: (screen: Screen) => void }) {
  return <div className="gold-guide-backdrop" onClick={onClose}><section className="gold-guide card" onClick={event => event.stopPropagation()}><button className="modal-close" onClick={onClose} aria-label="Kapat">×</button><div className="gold-guide-mark"><CollectionMark kind="badge" /></div><span className="eyebrow">ALTIN KAZAN</span><h2>Ödüller seni bekliyor.</h2><p>Altın satın alma yerine oyun içindeki başarılarınla kazanılır. Böylece koleksiyondaki her öğe gerçek bir ilerlemeyi temsil eder.</p><div className="gold-source-list"><article><b>Günlük görevler</b><span>100–300 altın</span><small>Hız, kategori ve sosyal hedefleri tamamla.</small></article><article><b>Turnuvalar</b><span>500–5.000 altın</span><small>Haftalık sıralamada yerini al.</small></article><article><b>Maç serileri</b><span>Seri bonusu</span><small>Arka arkaya galibiyetlerde ödül katlanır.</small></article></div><div className="gold-guide-actions"><button className="secondary" onClick={() => onNavigate('tasks')}>Görevlere Git</button><button className="primary" onClick={() => onNavigate('tournament')}>Turnuvayı Gör</button></div></section></div>
}

function Leaderboard() {
  const [period, setPeriod] = useState('Haftalık')
  const [scope, setScope] = useState('Global')
  const [category, setCategory] = useState('Tüm kategoriler')
  const fullBoard = [
    { name: 'Elif', score: '8.420', color: 'mint', trend: '+2', fill: 100, note: '9 maç' },
    { name: 'Baran', score: '7.980', color: 'amber', trend: '+1', fill: 94, note: '8 maç' },
    { name: 'Sen', score: '7.310', color: 'lavender', trend: '+1', fill: 86, note: '8 maç' },
    { name: 'Kaan', score: '6.900', color: 'rust', trend: '-1', fill: 81, note: '7 maç' },
    { name: 'Zeynep', score: '6.540', color: 'gold', trend: '+3', fill: 76, note: '7 maç' },
    { name: 'Mert', score: '6.120', color: 'blue', trend: '—', fill: 70, note: '6 maç' },
    { name: 'Deniz', score: '5.880', color: 'mint', trend: '-2', fill: 65, note: '6 maç' },
  ]
  const entries = scope === 'Arkadaşlar' ? fullBoard.filter(player => ['Elif', 'Baran', 'Sen', 'Zeynep', 'Mert'].includes(player.name)) : fullBoard
  const podium = [entries[1], entries[0], entries[2]]
  const podiumRanks = [2, 1, 3]
  const title = period === 'Haftalık' ? 'Haftalık Lig' : period === 'Aylık' ? 'Aylık sıralama' : 'Tüm zamanların zirvesi'
  return <section className="leaderboard-page leaderboard-v2">
    <header className="league-hero card" style={{ backgroundImage: `url(${leaderboardHero})` }}>
      <div className="league-hero-copy"><span className="eyebrow">LİG MERKEZİ · SEZON 07</span><div className="league-live"><i></i><span>Lig canlı</span><b>Yenilenmeye 2 gün 14 saat</b></div><h2>{title.split(' ').slice(0, -1).join(' ')} <span>{title.split(' ').slice(-1)}</span></h2><p>Her maç seni yukarı taşır. Bu haftanın liderlerini takip et, masadaki yerini güçlendir.</p><div className="league-hero-meta"><span><b>3.</b> sıradasın</span><span><b>280 puan</b> zirve farkı</span><span><b>8 maç</b> oynadın</span></div></div>
      <div className="league-current-rank"><small>MEVCUT KONUM</small><strong>03</strong><span>Safir Ligi</span></div>
    </header>

    <section className="league-toolbar card" aria-label="Sıralama filtreleri"><div className="league-tabs" role="tablist" aria-label="Dönem">{['Haftalık', 'Aylık', 'Tüm zamanlar'].map(item => <button className={period === item ? 'active' : ''} key={item} onClick={() => setPeriod(item)} role="tab" aria-selected={period === item}>{item}</button>)}</div><div className="league-toolbar-right"><div className="league-scope">{['Global', 'Arkadaşlar'].map(item => <button className={scope === item ? 'active' : ''} key={item} onClick={() => setScope(item)}>{item}</button>)}</div><label className="league-category"><span>KATEGORİ</span><select value={category} onChange={event => setCategory(event.target.value)}><option>Tüm kategoriler</option><option>Sinema</option><option>Bilim</option><option>Tarih</option><option>Genel Kültür</option></select></label></div></section>

    <section className="league-podium card"><div className="league-section-head"><div><span className="eyebrow">HAFTANIN ÖNE ÇIKANLARI</span><h3>İlk üç</h3></div><p>{scope} · {category}</p></div><div className="league-podium-grid">{podium.map((player, index) => <article className={`league-podium-player rank-${podiumRanks[index]}`} key={player.name}><span className="league-rank-chip">{String(podiumRanks[index]).padStart(2, '0')}</span><span className={`avatar ${player.color}`}>{player.name[0]}</span><div><b>{player.name}</b>{player.name === 'Sen' && <small>Sen</small>}</div><strong>{player.score}<em>puan</em></strong><i className="league-podium-base"></i></article>)}</div></section>

    <div className="league-content-grid"><section className="league-standings card"><div className="league-section-head"><div><span className="eyebrow">CANLI TABLO</span><h3>{scope} sıralaması</h3></div><p>{entries.length} oyuncu</p></div><div className="league-column-labels"><span>SIRA</span><span>OYUNCU</span><span>FORM</span><span>PUAN</span></div>{entries.map((player, index) => <article className={`league-row ${player.name === 'Sen' ? 'is-self' : ''}`} key={player.name}><b className="league-place">{String(index + 1).padStart(2, '0')}</b><div className="league-player"><span className={`avatar ${player.color}`}>{player.name[0]}</span><div><strong>{player.name}</strong><small>{player.name === 'Sen' ? 'Sen · Safir Ligi' : player.note}</small></div></div><div className="league-form"><i><em style={{ width: `${player.fill}%` }}></em></i><span className={player.trend.startsWith('+') ? 'up' : player.trend.startsWith('-') ? 'down' : ''}>{player.trend}</span></div><strong className="league-score">{player.score}<small>puan</small></strong></article>)}</section><aside className="league-rail"><section className="league-goal card"><span className="eyebrow">YÜKSELİŞ HEDEFİ</span><h3>Altın Lig'e <span>280 puan</span></h3><p>İlk üç oyuncu haftalık ödüller ve bir üst lig için yarışır.</p><div className="league-goal-progress"><i><em></em></i><div><span>7.310</span><b>7.590</b></div></div><button className="secondary">Ödül detaylarını gör</button></section><section className="league-self-summary card"><div><span className="eyebrow">SENİN HAFTAN</span><strong>3.</strong><small>sıra</small></div><dl><div><dt>Doğruluk</dt><dd>%78</dd></div><div><dt>En iyi seri</dt><dd>4</dd></div><div><dt>Kazanç</dt><dd>+850</dd></div></dl></section></aside></div>
  </section>
}
function ResultMark({ kind }: { kind: 'accuracy' | 'speed' | 'xp' }) {
  const icon = kind === 'accuracy' ? <><circle cx="24" cy="24" r="15"/><circle cx="24" cy="24" r="5"/><path d="m33 15 7-7"/></> : kind === 'speed' ? <><path d="M28 5 12 27h11l-3 16 16-24H25l3-14Z"/></> : <><path d="M24 6 29 17l12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1 5-11Z"/></>
  return <svg className="result-mark" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icon}</svg>
}

function Finish({ score, correct, total, category, mode, opponentScores, onHome, onAgain }: { score:number, correct:number, total:number, category:string, mode:'classic'|'lightning', opponentScores:Record<string,number>, onHome:()=>void,onAgain:()=>void }) {
  const [votes, setVotes] = useState(3)
  const [voted, setVoted] = useState(false)
  const voteRematch = () => { if (voted) { setVotes(value => Math.max(3, value - 1)); setVoted(false); return } const nextVotes = votes + 1; setVotes(nextVotes); setVoted(true); if (nextVotes >= 6) window.setTimeout(onAgain, 500) }
  const standings = [{ name: 'Sen', letter: 'S', color: 'lavender', score }, ...Object.entries(opponentScores).map(([name, playerScore]) => ({ name, letter: name[0], color: name === 'Baran' ? 'amber' : name === 'Elif' ? 'mint' : name === 'Kaan' ? 'rust' : 'gold', score: playerScore }))].sort((a, b) => b.score - a.score)
  const rank = standings.findIndex(player => player.name === 'Sen') + 1
  const winner = rank === 1
  const podium = [standings[1], standings[0], standings[2]].filter(Boolean)
  return <section className="finish-wrap finish-dashboard">
    <header className="finish-heading">
      <span className="eyebrow">MAÇ TAMAMLANDI</span>
      <h2>{winner ? <>Masayı <span>sen kazandın.</span></> : <>Bu turu <span>{rank}. sırada</span> tamamladın.</>}</h2>
      <p>{category === 'Tümü' ? 'Karışık kategoriler' : category} · {mode === 'lightning' ? 'Yıldırım Turu' : 'Klasik Masa'} · {total} soru</p>
    </header>
    <div className="finish-main-grid">
      <section className="podium card">
        {podium.map((player, index) => <div className={`podium-player ${['second','first','third'][index]}`} key={`${player.name}-${index}`}>
          {index === 1 ? <div className="winner-ring"><span className={`avatar ${player.color}`}>{player.letter}</span></div> : <span className={`avatar ${player.color}`}>{player.letter}</span>}
          <b>{player.name}</b><small>{player.score.toLocaleString('tr-TR')} puan</small><strong>{standings.findIndex(item => item.name === player.name) + 1}</strong>
        </div>)}
      </section>
      <aside className="finish-rewards card"><span className="eyebrow">KAZANIMLAR</span><h3>Bu maçtan aldıkların</h3><div className="reward-row"><ResultMark kind="xp"/><div><small>Deneyim puanı</small><b>+{correct * 40 + 80} XP</b></div></div><div className="reward-row"><ResultMark kind="speed"/><div><small>Maç puanı</small><b>+{score} puan</b></div></div><div className="league-lift"><span>Haftalık lig</span><b>{rank}. sıra</b><small>{winner ? '+1 · Altın Lige 280 puan' : 'Bir sonraki maçta yükselme şansın var'}</small></div></aside>
    </div>
    <section className="finish-performance"><div className="finish-performance-head"><div><span className="eyebrow">PERFORMANSIN</span><h3>{correct >= Math.ceil(total / 2) ? 'Bu turda çok iyiydin.' : 'Bir sonraki turda geri alırsın.'}</h3></div><span className="finish-score">{correct} / {total} doğru</span></div><div className="finish-metrics"><article><ResultMark kind="accuracy"/><small>Doğruluk oranı</small><b>%{Math.round((correct / total) * 100)}</b><span>{correct} doğru yanıt · gerçek maç verisi</span></article><article><ResultMark kind="speed"/><small>Toplam maç puanı</small><b>{score}</b><span>{mode === 'lightning' ? 'Yıldırım turu çarpanı uygulandı' : 'Klasik masa puanları'}</span></article><article><ResultMark kind="xp"/><small>Seri bonusu</small><b>x{correct >= 3 ? 2 : 1}</b><span>Her doğru cevap sonraki maçlara katkı verir</span></article></div></section>
    <div className="finish-actions"><button className="secondary" onClick={onHome}>Ana sayfaya dön</button><button className={voted ? 'primary voted' : 'primary'} onClick={voteRematch}>{voted ? `Rövanş için oy verdin · ${votes}/6` : `Rövanş iste · ${votes}/6`}</button></div><p className="finish-next">Tüm oyuncular onaylarsa aynı kadroyla yeni maç otomatik başlar.</p>
  </section>
}

createRoot(document.getElementById('root')!).render(<StrictMode><ActivityApp /></StrictMode>)




































