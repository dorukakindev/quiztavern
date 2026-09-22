import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { GameState } from '../../../shared/types'

type RoutePrompt = {
  letter: string
  clue: string
  answer: string
  category: string
}

const prompts: RoutePrompt[] = [
  { letter: 'A', clue: 'Dünyanın çevresini saran gaz katmanı.', answer: 'atmosfer', category: 'Bilim' },
  { letter: 'B', clue: 'Bir konuda edinilmiş doğru veriler bütünü.', answer: 'bilgi', category: 'Genel Kültür' },
  { letter: 'C', clue: 'Bir sorunun doğru karşılığı.', answer: 'cevap', category: 'Genel Kültür' },
  { letter: 'D', clue: 'Güneş sistemindeki yaşadığımız gezegen.', answer: 'dünya', category: 'Bilim' },
  { letter: 'E', clue: 'Duygu ve düşünceleri sözle anlatan sanat dalı.', answer: 'edebiyat', category: 'Sanat' },
  { letter: 'F', clue: 'Bitkilerin ışıkla besin üretme süreci.', answer: 'fotosentez', category: 'Biyoloji' },
  { letter: 'G', clue: 'Güneş sisteminin merkezi yıldızı.', answer: 'güneş', category: 'Uzay' },
  { letter: 'H', clue: 'Canlıların en küçük yapı ve görev birimi.', answer: 'hücre', category: 'Biyoloji' },
  { letter: 'I', clue: 'Sıcaklık farkıyla aktarılan enerji.', answer: 'ısı', category: 'Fizik' },
  { letter: 'İ', clue: 'Türkiye’nin en kalabalık şehri.', answer: 'istanbul', category: 'Coğrafya' },
  { letter: 'K', clue: 'Bir cismin hareketini değiştiren etki.', answer: 'kuvvet', category: 'Fizik' },
  { letter: 'L', clue: 'Soğanlı, baharın simgesi olan çiçek.', answer: 'lale', category: 'Doğa' },
  { letter: 'M', clue: 'Bir ses dizisini oluşturan düzenli notalar.', answer: 'melodi', category: 'Müzik' },
  { letter: 'N', clue: 'Müzikte sesi gösteren işaret.', answer: 'nota', category: 'Müzik' },
  { letter: 'O', clue: 'Kıtaları çevreleyen dev tuzlu su kütlesi.', answer: 'okyanus', category: 'Coğrafya' },
  { letter: 'Ö', clue: 'Başarı karşılığında verilen armağan.', answer: 'ödül', category: 'Genel Kültür' },
  { letter: 'P', clue: 'Dünyanın en büyük okyanusu.', answer: 'pasifik', category: 'Coğrafya' },
  { letter: 'R', clue: 'Bir cismin ekseni etrafındaki dönüş hareketi.', answer: 'rotasyon', category: 'Bilim' },
  { letter: 'S', clue: 'Görüntü, ses ve hikâyeyi bir araya getiren sanat dalı.', answer: 'sinema', category: 'Sanat' },
  { letter: 'T', clue: 'Geçmişte yaşanmış olayları inceleyen bilim dalı.', answer: 'tarih', category: 'Tarih' },
]

const normalize = (value: string) => value.toLocaleLowerCase('tr-TR').replace(/\s+/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')

const createCircleDemoState = (): GameState => {
  const now = Date.now()
  const first = prompts[0]
  const demoPlayers = [
    { id: 'demo-self', seat: 0, name: 'Sen', avatarUrl: null, score: 0, connected: true, ready: true, isBot: false, answered: false, waiting: false },
    { id: 'demo-elif', seat: 1, name: 'Elif', avatarUrl: null, score: 0, connected: true, ready: true, isBot: true, answered: false, waiting: false },
    { id: 'demo-baran', seat: 2, name: 'Baran', avatarUrl: null, score: 0, connected: true, ready: true, isBot: true, answered: false, waiting: false },
    { id: 'demo-zeynep', seat: 3, name: 'Zeynep', avatarUrl: null, score: 0, connected: true, ready: true, isBot: true, answered: false, waiting: false },
  ]
  return {
    phase: 'question', gameMode: 'circle', questionCount: 10, roomId: 'local-circle-demo', hostId: 'demo-self', youId: 'demo-self',
    players: demoPlayers, round: { index: 0, total: prompts.length }, question: null,
    circle: { letter: first.letter, clue: first.clue, category: first.category, deadline: now + 45000, durationMs: 45000 },
    countdown: null,
    yourChoice: null, yourCircleAnswer: null, reveal: null, circleReveal: null, podium: null, matchSummary: null,
    answeredCount: 0, eligibleCount: demoPlayers.length, minPlayers: 1,
    categorySelection: [], availableCategories: [], devMode: true, serverNow: now,
  }
}

function SoloWordRoute({ onBack }: { onBack: () => void }) {
  const [route, setRoute] = useState(() => [...prompts])
  const [index, setIndex] = useState(0)
  const [input, setInput] = useState('')
  const [seconds, setSeconds] = useState(180)
  const [solved, setSolved] = useState<string[]>([])
  const [passed, setPassed] = useState<string[]>([])
  const [message, setMessage] = useState('İlk harften başla; takılırsan pas geçebilirsin.')
  const [finished, setFinished] = useState(false)

  const current = route[index]
  const score = useMemo(() => solved.length * 100 + (solved.length ? Math.floor(seconds / 10) * 5 : 0), [solved.length, seconds])

  useEffect(() => {
    if (finished) return
    const timer = window.setInterval(() => setSeconds(value => Math.max(0, value - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [finished])

  useEffect(() => {
    if (seconds === 0) setFinished(true)
  }, [seconds])

  const moveNext = () => {
    if (index + 1 >= route.length) setFinished(true)
    else setIndex(value => value + 1)
  }

  const submit = () => {
    if (!current || !input.trim()) return
    if (normalize(input) === normalize(current.answer)) {
      setSolved(value => [...value, current.letter])
      setMessage(`${current.letter} harfi çözüldü. Güzel yakaladın.`)
      setInput('')
      moveNext()
      return
    }
    setMessage('Bu cevap uymadı; tekrar dene veya pas geç.')
  }

  const pass = () => {
    if (!current) return
    setPassed(value => [...value, current.letter])
    setRoute(value => [...value, current])
    setMessage(`${current.letter} tur sonuna alındı.`)
    setInput('')
    setIndex(value => value + 1)
  }

  const restart = () => {
    setRoute([...prompts])
    setIndex(0)
    setInput('')
    setSeconds(180)
    setSolved([])
    setPassed([])
    setMessage('Yeni rota hazır. Başlayalım.')
    setFinished(false)
  }

  const elapsed = 180 - seconds
  const minute = String(Math.floor(seconds / 60)).padStart(2, '0')
  const second = String(seconds % 60).padStart(2, '0')

  return <section className="word-route-page">
    <header className="word-route-head">
      <button className="route-back" onClick={onBack}>← Ana sayfa</button>
      <div><span className="eyebrow">KELİME & BİLGİ MODU</span><h1>Çem<span>ber</span></h1><p className="word-route-subtitle">Her harf bir ipucu. Cevap o harfle başlar.</p></div>
      <div className="route-score"><small>PUAN</small><b>{score}</b></div>
    </header>

    <div className="word-route-layout">
      <aside className="route-summary card">
        <div className="route-timer"><i></i><b>{minute}:{second}</b><small>KALAN SÜRE</small></div>
        <div className="route-summary-line"><span>Çözülen</span><b>{solved.length} / {prompts.length}</b></div>
        <div className="route-summary-line"><span>Pas</span><b>{passed.length}</b></div>
        <p>Her doğru cevap puan kazandırır. Pas geçtiğin harfler turun sonunda yeniden gelir.</p>
      </aside>

      <main className="route-board card">
        <div className="route-progress"><span>{Math.min(index + 1, route.length)}. durak</span><i><b style={{ width: `${Math.min(100, ((index + 1) / Math.max(route.length, 1)) * 100)}%` }}></b></i><span>{route.length} soru</span></div>
        {!finished && current ? <>
          <div className="route-letter-wrap"><div className="route-letter">{current.letter}</div><span>{current.category}</span></div>
          <h2>{current.clue}</h2>
          <p className="route-rule">Cevap <b>{current.letter}</b> harfiyle başlamalıdır.</p>
          <form className="route-answer" onSubmit={event => { event.preventDefault(); submit() }}>
            <input autoFocus value={input} onChange={event => setInput(event.target.value)} placeholder="Cevabını yaz" aria-label="Cevabını yaz" />
            <button className="primary" type="submit">Kilitle</button>
          </form>
          <div className="route-actions"><button onClick={pass}>Pas geç</button><span>{message}</span></div>
        </> : <div className="route-finish">
          <span className="eyebrow">ROTA TAMAMLANDI</span><h2>{solved.length} harf çözdün.</h2>
          <p>{elapsed < 180 ? `${minute}:${second} kala bitirdin.` : 'Süre doldu; rota burada tamamlandı.'}</p>
          <strong>{score} puan</strong>
          <div><button className="primary" onClick={restart}>Yeni rota</button><button className="secondary" onClick={onBack}>Ana sayfa</button></div>
        </div>}
      </main>

      <aside className="route-ring card" aria-label="Harf rotası">
        <h2>Harf Çemberi</h2>
        <div className="route-orbit">
          {prompts.map((prompt, itemIndex) => <span key={`${prompt.letter}-${itemIndex}`} className={`${solved.includes(prompt.letter) ? 'solved' : ''} ${!finished && route[index]?.letter === prompt.letter ? 'current' : ''} ${passed.includes(prompt.letter) && !solved.includes(prompt.letter) ? 'passed' : ''}`} style={{ '--angle': `${(360 / prompts.length) * itemIndex}deg` } as CSSProperties}>{prompt.letter}</span>)}
          <b>{solved.length}<small>/ {prompts.length}</small></b>
        </div>
        <p>Doğru harfler rotanı aydınlatır.</p>
      </aside>
    </div>
  </section>
}

type CircleMatchProps = {
  state: GameState | null
  onBack: () => void
  onAnswer: (answer: string) => void
  onAgain: () => void
}

function CircleMatch({ state, onBack, onAnswer, onAgain }: CircleMatchProps) {
  const [input, setInput] = useState('')
  const [demoState, setDemoState] = useState<GameState | null>(null)
  // A stale quiz state can remain in realtime while the user opens Çember.
  // Only a real circle state should win over the local test state.
  const serverCircleState = state?.gameMode === 'circle' ? state : null
  const activeState = serverCircleState ?? demoState
  const circle = activeState?.circle
  const reveal = activeState?.circleReveal
  const self = activeState?.players.find(player => player.id === activeState.youId)
  const [remaining, setRemaining] = useState(0)

  useEffect(() => {
    if (!circle) return
    const update = () => setRemaining(Math.max(0, circle.deadline - Date.now()))
    update()
    const timer = window.setInterval(update, 200)
    return () => window.clearInterval(timer)
  }, [circle?.deadline])

  const startDemo = () => {
    setInput('')
    setDemoState(createCircleDemoState())
  }

  if (!activeState || activeState.gameMode !== 'circle') return <section className="circle-waiting card"><span className="eyebrow">ÇEMBER MASASI</span><h2>Masa hazırlanıyor</h2><p>Backend bağlantısı hazır olduğunda oyuncular ve harf rotası sunucudan alınacak.</p><div className="circle-waiting-actions"><button className="primary" onClick={startDemo}>Başlat</button><button className="secondary" onClick={onBack}>Geri dön</button></div><small className="circle-demo-note">Yerel demo · örnek oyuncularla test</small></section>
  if (activeState.phase === 'lobby') return <section className="circle-waiting card"><span className="eyebrow">ÇEMBER MASASI</span><h2>Oyuncular bekleniyor</h2><p>Oda sahibi Çember turunu başlattığında herkes aynı harfte yarışacak.</p><button className="secondary" onClick={onBack}>Lobilere dön</button></section>

  const seconds = Math.ceil(remaining / 1000)
  const ownLocked = Boolean(activeState.yourCircleAnswer)
  const submit = () => {
    if (!input.trim() || ownLocked || activeState.phase !== 'question') return
    if (demoState && !serverCircleState) {
      const answer = input.trim()
      const correct = normalize(answer) === normalize(prompts[activeState.round.index]?.answer || '')
      const updatedPlayers = activeState.players.map(player => player.id === activeState.youId ? { ...player, answered: true, score: correct ? 450 : 0 } : player)
      setDemoState({
        ...activeState, phase: 'reveal', players: updatedPlayers, yourCircleAnswer: answer, answeredCount: 1,
        circleReveal: { answer: prompts[activeState.round.index]?.answer || '', rankedPlayerIds: correct ? [activeState.youId, 'demo-elif'] : [], gains: correct ? { [activeState.youId]: 450, 'demo-elif': 320 } : {}, until: Date.now() + 3000, durationMs: 3000 },
      })
    } else onAnswer(input)
    setInput('')
  }
  const handleAgain = () => {
    if (demoState && !serverCircleState) { startDemo(); return }
    onAgain()
  }
  const ranked = reveal?.rankedPlayerIds.map(id => activeState.players.find(player => player.id === id)).filter(Boolean) ?? []

  return <section className="circle-match-page">
    <header className="circle-match-head"><button className="route-back" onClick={onBack}>← Lobiden ayrıl</button><div><span className="eyebrow">ÇEMBER · ÇOK OYUNCULU</span><h1>Herkes aynı <span>harfte.</span></h1></div><div className="circle-match-score"><small>PUANIN</small><b>{self?.score ?? 0}</b></div></header>
    <div className="circle-match-layout">
      <aside className="circle-players card"><span className="eyebrow">MASADAKİLER</span>{activeState.players.map(player => <div className={`circle-player ${player.id === activeState.youId ? 'self' : ''}`} key={player.id}><span className="circle-player-mark">{player.name.slice(0, 1)}</span><div><b>{player.name}{player.id === activeState.youId ? ' (sen)' : ''}</b><small>{activeState.phase === 'question' ? player.answered ? 'Cevabını kilitledi' : 'Yanıt bekliyor' : `${player.score} puan`}</small></div><strong>{player.score}</strong></div>)}</aside>
      <main className="circle-round card">
        {activeState.phase === 'question' && circle && <>
          <div className="circle-round-top"><span>{activeState.round.index + 1} / {activeState.round.total}. harf</span><div className={seconds <= 4 ? 'circle-time urgent' : 'circle-time'}><b>{seconds}</b><small>SANİYE</small></div><span>{activeState.answeredCount} / {activeState.eligibleCount} kilitledi</span></div>
          <div className="circle-letter">{circle.letter}</div><span className="circle-category">{circle.category}</span><h2>{circle.clue}</h2><p>Cevap <b>{circle.letter}</b> harfiyle başlamalıdır. İlk doğru daha fazla puan alır; tur herkes için sürer.</p>
          <div className="circle-scoring"><span><b>1.</b> +450</span><span><b>2.</b> +320</span><span><b>3.</b> +220</span><span><b>4.</b> +150</span><span><b>5.</b> +100</span></div>
          <form onSubmit={event => { event.preventDefault(); submit() }} className="circle-answer-form"><input autoFocus disabled={ownLocked} value={input} onChange={event => setInput(event.target.value)} placeholder={ownLocked ? 'Cevabın kilitlendi' : 'Cevabını yaz'} /><button className="primary" disabled={ownLocked} type="submit">{ownLocked ? 'Kilitledin' : 'Cevabı kilitle'}</button></form>
          <small className="circle-lock-note">{ownLocked ? 'Diğer oyuncuların cevapları gizli. Süre sonunda hız sırası açıklanır.' : 'Tek cevap hakkın var; yanlış cevap da kilitlenir.'}</small>
        </>}
        {activeState.phase === 'reveal' && reveal && <div className="circle-reveal"><span className="eyebrow">HARF ÇÖZÜLDÜ</span><h2>Doğru cevap: <b>{reveal.answer}</b></h2><p>Tur, herkes cevaplayabilsin diye süre dolana ya da tüm cevaplar kilitlenene kadar devam eder.</p><div className="circle-rank-list">{ranked.length ? ranked.map((player, index) => player && <div key={player.id}><span>{index + 1}</span><b>{player.name}</b><strong>+{reveal.gains[player.id]} puan</strong></div>) : <p>Bu harfi doğru bilen olmadı.</p>}</div><small>Demo turu tamamlandı. Yeni harfle tekrar deneyebilirsin.</small><button className="primary" onClick={handleAgain}>Yeni harfle başlat</button></div>}
        {activeState.phase === 'podium' && <div className="circle-reveal circle-finish"><span className="eyebrow">ÇEMBER TAMAMLANDI</span><h2>{activeState.players[0]?.id === activeState.youId ? 'Çemberin lideri sensin.' : 'Tur tamamlandı.'}</h2><div className="circle-rank-list">{activeState.players.map((player, index) => <div key={player.id}><span>{index + 1}</span><b>{player.name}</b><strong>{player.score} puan</strong></div>)}</div>{activeState.hostId === activeState.youId ? <button className="primary" onClick={handleAgain}>Yeni çember</button> : <small>Yeni tur için oda sahibini bekle.</small>}</div>}
      </main>
    </div>
  </section>
}

export function WordRoute({ onBack, multiplayer = false, state = null, onAnswerCircle = () => {}, onAgain = () => {} }: { onBack: () => void; multiplayer?: boolean; state?: GameState | null; onAnswerCircle?: (answer: string) => void; onAgain?: () => void }) {
  if (multiplayer) return <CircleMatch state={state} onBack={onBack} onAnswer={onAnswerCircle} onAgain={onAgain} />
  return <SoloWordRoute onBack={onBack} />
}
