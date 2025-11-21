import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, FormEvent, PointerEvent as ReactPointerEvent } from 'react'
import './App.css'

type Participant = {
  id: string
  name: string
  beers: number
  createdAt: number
}

type DrinkEntry = {
  id: string
  participantId: string
  timestamp: number
}

type RouteStop = {
  id: string
  name: string
  address: string
  note?: string
  completed: boolean
}

type CardSuit = 'hearts' | 'diamonds' | 'clubs' | 'spades' | 'joker'
type CardRank =
  | 'A'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '10'
  | 'J'
  | 'Q'
  | 'K'
  | 'Joker'
type Card = { rank: CardRank; suit: CardSuit }

const demoParticipants: Participant[] = []

type HeroButtonId = 'beer' | 'arrival' | 'round' | 'reset'
type HoldStyle = CSSProperties & { '--hold-progress'?: number }

const HOLD_DURATION_MS = 1500
const ARRIVAL_COOLDOWN_MS = 30 * 1000
const ROUND_COOLDOWN_MS = 2 * 60 * 1000
const ADMIN_CODE = 'snag'
const OVER_UNDER_TARGET = 3
const MOOD_MAX = 100

const demoRoute: RouteStop[] = [
  {
    id: 's1',
    name: 'Start',
    address: 'Lektorvej 99',
    note: 'Mødes 13.00 - frokost',
    completed: false,
  },
  {
    id: 's2',
    name: 'John Bull',
    address: 'Østerågade 20',
    note: 'Stamsted for broder Ras – måske hænger der et billede af ham',
    completed: false,
  },
  {
    id: 's3',
    name: 'Øl & Venner',
    address: 'Sankt Hans Torv 3',
    note: 'Quiz kl. 14:30',
    completed: false,
  },
  {
    id: 's4',
    name: 'Kælderkroen',
    address: 'Falkoner Allé 52',
    note: 'Bordfodbold kl. 15:30',
    completed: false,
  },
  {
    id: 's5',
    name: 'Bodega Blå',
    address: 'Blågårdsgade 42',
    note: 'DJ fra kl. 17',
    completed: false,
  },
  {
    id: 's6',
    name: 'Guldbaren',
    address: 'Guldbergsgade 27',
    note: '2-for-1 kl. 17:45',
    completed: false,
  },
  {
    id: 's7',
    name: 'Natfinalen',
    address: 'Rantzausgade 10',
    note: 'Sidste runde 19:30',
    completed: false,
  },
]

const createId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 10)

const formatTime = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString('da-DK', {
    hour: '2-digit',
    minute: '2-digit',
  })

const formatDuration = (milliseconds: number) => {
  const totalSeconds = Math.max(Math.floor(milliseconds / 1000), 0)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}`
}

const createDeck = (): Card[] => {
  const suits: CardSuit[] = ['hearts', 'diamonds', 'clubs', 'spades']
  const ranks: CardRank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
  const base = suits.flatMap((suit) => ranks.map((rank) => ({ rank, suit })))
  return [...base, { rank: 'Joker', suit: 'joker' }, { rank: 'Joker', suit: 'joker' }]
}

const shuffleDeck = (cards: Card[]) => {
  const copy = [...cards]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

const useCountdown = (target: number | null) => {
  const [remaining, setRemaining] = useState<number>(() =>
    target ? Math.max(target - Date.now(), 0) : 0,
  )

  useEffect(() => {
    if (!target) {
      setRemaining(0)
      return
    }

    const update = () => setRemaining(Math.max(target - Date.now(), 0))
    update()
    const id = window.setInterval(update, 1000)
    return () => clearInterval(id)
  }, [target])

  return remaining
}

const findNextIncomplete = (stops: RouteStop[], startIndex = -1) => {
  for (let index = startIndex + 1; index < stops.length; index += 1) {
    if (!stops[index].completed) {
      return stops[index]
    }
  }
  return null
}

function App() {
  const [participants, setParticipants] = useState<Participant[]>(demoParticipants)
  const [routeStops, setRouteStops] = useState<RouteStop[]>(demoRoute)
  const [currentUserId, setCurrentUserId] = useState<string | null>(
    demoParticipants[0]?.id ?? null,
  )
  const [nameInput, setNameInput] = useState('')
  const [drinkLog, setDrinkLog] = useState<DrinkEntry[]>([])
  const [timerTarget, setTimerTarget] = useState<number | null>(null)
  const [timerDuration, setTimerDuration] = useState(0)
  const [activeStopId, setActiveStopId] = useState<string | null>(
    demoRoute[0]?.id ?? null,
  )
  const [moodScore, setMoodScore] = useState(0)
  const [arrivalCooldownUntil, setArrivalCooldownUntil] = useState<number | null>(null)
  const [roundHistory, setRoundHistory] = useState<string[]>([])
  const [roundCooldownUntil, setRoundCooldownUntil] = useState<number | null>(null)
  const [overUnderDeck, setOverUnderDeck] = useState<Card[]>([])
  const [overUnderCurrent, setOverUnderCurrent] = useState<Card | null>(null)
  const [overUnderLast, setOverUnderLast] = useState<Card | null>(null)
  const [overUnderStreak, setOverUnderStreak] = useState(0)
  const [overUnderMessage, setOverUnderMessage] = useState('')
  const [overUnderPenalty, setOverUnderPenalty] = useState<number | null>(null)
  const [aceMode, setAceMode] = useState<'low' | 'high' | 'both'>('both')
  const [isLoginOpen, setIsLoginOpen] = useState(false)
  const [pressedButton, setPressedButton] = useState<HeroButtonId | null>(null)
  const [holdTarget, setHoldTarget] = useState<HeroButtonId | null>(null)
  const [holdProgress, setHoldProgress] = useState(0)
  const [adminUnlocked, setAdminUnlocked] = useState(false)
  const [adminPrompt, setAdminPrompt] = useState('')
  const [showAdminPrompt, setShowAdminPrompt] = useState(false)
  const heroFeedbackTimeout = useRef<number | null>(null)
  const holdAnimationFrame = useRef<number | null>(null)
  const holdStartTimestamp = useRef<number | null>(null)
  const holdActionRef = useRef<(() => void) | null>(null)
  const holdIdRef = useRef<HeroButtonId | null>(null)

  const currentUser = participants.find((p) => p.id === currentUserId) ?? null
  const activeStop = routeStops.find((stop) => stop.id === activeStopId) ?? null
  const nextStop = useMemo(() => {
    if (!routeStops.length) return null
    const firstIncomplete = routeStops.find((stop) => !stop.completed) ?? null
    if (!activeStopId) return firstIncomplete
    const index = routeStops.findIndex((stop) => stop.id === activeStopId)
    if (index === -1) return firstIncomplete
    return findNextIncomplete(routeStops, index)
  }, [routeStops, activeStopId])
  const countdownMs = useCountdown(timerTarget)
  const countdownDisplay = timerTarget ? formatDuration(countdownMs) : '00:00'
  const isTimerRunning = timerTarget !== null && countdownMs > 0
  const isLocked = !currentUser
  const arrivalCooldownMs = useCountdown(arrivalCooldownUntil)
  const arrivalCooldownRemaining = useMemo(() => {
    const immediate = arrivalCooldownUntil
      ? Math.max(arrivalCooldownUntil - Date.now(), 0)
      : 0
    return Math.max(arrivalCooldownMs, immediate)
  }, [arrivalCooldownMs, arrivalCooldownUntil])
  const isArrivalOnCooldown =
    arrivalCooldownUntil !== null && arrivalCooldownRemaining > 0
  const roundCooldownMs = useCountdown(roundCooldownUntil)
  const roundCooldownRemaining = useMemo(() => {
    const immediate = roundCooldownUntil ? Math.max(roundCooldownUntil - Date.now(), 0) : 0
    return Math.max(roundCooldownMs, immediate)
  }, [roundCooldownMs, roundCooldownUntil])
  const isRoundOnCooldown = roundCooldownUntil !== null && roundCooldownRemaining > 0
  const overUnderProgress = `${Math.min(overUnderStreak, OVER_UNDER_TARGET)}/${OVER_UNDER_TARGET}`

  const ranking = useMemo(
    () => [...participants].sort((a, b) => b.beers - a.beers),
    [participants],
  )

  const moodLevel = useMemo(() => {
    if (moodScore >= 100) return 6
    if (moodScore >= 80) return 5
    if (moodScore >= 70) return 4
    if (moodScore >= 60) return 3
    if (moodScore >= 40) return 2
    if (moodScore >= 20) return 1
    return 0
  }, [moodScore])
  const moodProgress = Math.min(moodScore, MOOD_MAX)

  const lastRoundWinnerId = roundHistory[roundHistory.length - 1] ?? null
  const lastRoundWinner = useMemo(
    () => participants.find((participant) => participant.id === lastRoundWinnerId) ?? null,
    [participants, lastRoundWinnerId],
  )

  const handleLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = nameInput.trim()
    if (!trimmed) return

    const existing = participants.find(
      (participant) => participant.name.toLowerCase() === trimmed.toLowerCase(),
    )

    if (existing) {
      setCurrentUserId(existing.id)
    } else {
      const newParticipant: Participant = {
        id: createId(),
        name: trimmed,
        beers: 0,
        createdAt: Date.now(),
      }
      setParticipants((prev) => [...prev, newParticipant])
      setCurrentUserId(newParticipant.id)
    }

    setNameInput('')
    setIsLoginOpen(false)
  }

  const logDrink = () => {
    if (!currentUser) return

    setParticipants((prev) =>
      prev.map((participant) =>
        participant.id === currentUser.id
          ? { ...participant, beers: participant.beers + 1 }
          : participant,
      ),
    )

    setDrinkLog((prev) => [
      ...prev,
      { id: createId(), participantId: currentUser.id, timestamp: Date.now() },
    ])
    bumpMood(1)
  }

  const markStopComplete = (stopId: string) => {
    const isActive = stopId === activeStopId

    setRouteStops((prev) =>
      prev.map((stop) =>
        stop.id === stopId ? { ...stop, completed: !stop.completed } : stop,
      ),
    )

    if (isActive) {
      resetTimer()
    }
  }

  const startTimer = (minutes: number, override = false) => {
    if (!adminUnlocked && !override) return
    const duration = minutes * 60 * 1000
    setTimerDuration(duration)
    setTimerTarget(Date.now() + duration)
  }

  const extendTimer = (minutes: number, override = false) => {
    if (!adminUnlocked && !override) return
    if (!timerTarget) {
      startTimer(minutes, override)
      return
    }

    const additional = minutes * 60 * 1000
    setTimerDuration((prev) => prev + additional)
    setTimerTarget((prev) => (prev ? prev + additional : Date.now() + additional))
  }

  const resetTimer = (override = false) => {
    if (!adminUnlocked && !override) return
    setTimerTarget(null)
    setTimerDuration(0)
  }

  const updateActiveStop = (stopId: string | null, restartTimer: boolean) => {
    setActiveStopId(stopId)
    if (!stopId) {
      resetTimer(true)
      return
    }
    if (restartTimer) {
      startTimer(30, true)
    }
  }

  const pickNextRound = () => {
    if (!participants.length) return

    const now = Date.now()
    if (roundCooldownUntil && roundCooldownUntil > now) {
      return
    }

    if (isRoundOnCooldown) {
      return
    }

    const lastChoice = roundHistory[roundHistory.length - 1] ?? null
    const available = participants.filter((participant) => participant.id !== lastChoice)
    const pool = available.length > 0 ? available : participants

    const chosen = pool[Math.floor(Math.random() * pool.length)]

    setRoundHistory((prev) => [...prev, chosen.id])
    setRoundCooldownUntil(now + ROUND_COOLDOWN_MS)
    bumpMood(5)
  }

  useEffect(() => {
    if (!arrivalCooldownUntil) return
    if (arrivalCooldownUntil <= Date.now() && arrivalCooldownRemaining === 0) {
      setArrivalCooldownUntil(null)
    }
  }, [arrivalCooldownRemaining, arrivalCooldownUntil])

  useEffect(() => {
    return () => {
      if (heroFeedbackTimeout.current) {
        clearTimeout(heroFeedbackTimeout.current)
      }
      if (holdAnimationFrame.current) {
        cancelAnimationFrame(holdAnimationFrame.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!roundCooldownUntil) return
    if (roundCooldownUntil <= Date.now() && roundCooldownRemaining === 0) {
      setRoundCooldownUntil(null)
    }
  }, [roundCooldownRemaining, roundCooldownUntil])

  useEffect(() => {
    if (!overUnderCurrent) {
      resetOverUnder()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (moodScore > MOOD_MAX) {
      setMoodScore(MOOD_MAX)
    }
  }, [moodScore])

  const handleArrival = () => {
    if (isTimerRunning) return
    const now = Date.now()
    if (arrivalCooldownUntil && arrivalCooldownUntil > now) return
    if (isArrivalOnCooldown) return
    if (!activeStop) return

    const upcoming = nextStop

    setRouteStops((prev) =>
      prev.map((stop) =>
        stop.id === activeStop.id ? { ...stop, completed: true } : stop,
      ),
    )

    if (upcoming) {
      updateActiveStop(upcoming.id, true)
    } else {
      updateActiveStop(null, false)
    }

    bumpMood(5)
    setArrivalCooldownUntil(now + ARRIVAL_COOLDOWN_MS)
  }

  const resetRanking = () => {
    setParticipants((prev) => prev.map((participant) => ({ ...participant, beers: 0 })))
    setDrinkLog([])
  }

  const deleteParticipant = (participantId: string) => {
    if (!adminUnlocked) return
    setParticipants((prev) => prev.filter((participant) => participant.id !== participantId))
    setDrinkLog((prev) => prev.filter((entry) => entry.participantId !== participantId))
    setRoundHistory((prev) => prev.filter((id) => id !== participantId))
    setCurrentUserId((prev) => (prev === participantId ? null : prev))
  }

  const bumpMood = (amount: number) => {
    setMoodScore((prev) => Math.min(prev + amount, MOOD_MAX))
  }

  const setMood = (value: number) => {
    if (!adminUnlocked) return
    const clamped = Math.min(Math.max(value, 0), MOOD_MAX)
    setMoodScore(clamped)
  }

  const getCardValue = (card: Card, direction: 'over' | 'under') => {
    if (card.rank === 'Joker') {
      return direction === 'over' ? 99 : -1
    }
    const map: Record<CardRank, number> = {
      A: aceMode === 'high' ? 14 : aceMode === 'low' ? 1 : direction === 'over' ? 14 : 1,
      '2': 2,
      '3': 3,
      '4': 4,
      '5': 5,
      '6': 6,
      '7': 7,
      '8': 8,
      '9': 9,
      '10': 10,
      J: 11,
      Q: 12,
      K: 13,
      Joker: direction === 'over' ? 99 : -1,
    }
    return map[card.rank]
  }

  const suitIcon: Record<CardSuit, string> = {
    hearts: '♥',
    diamonds: '♦',
    clubs: '♣',
    spades: '♠',
    joker: '🃏',
  }

  const drawCard = () => {
    let deck = overUnderDeck
    if (!deck.length) {
      deck = shuffleDeck(createDeck())
    }
    const [next, ...rest] = deck
    setOverUnderDeck(rest)
    return next ?? null
  }

  const resetOverUnder = () => {
    const fresh = shuffleDeck(createDeck())
    const [first, ...rest] = fresh
    setOverUnderDeck(rest)
    setOverUnderCurrent(first ?? null)
    setOverUnderLast(null)
    setOverUnderStreak(0)
    setOverUnderMessage('Gæt over eller under for næste kort')
    setOverUnderPenalty(null)
  }

  const handleOverUnderGuess = (direction: 'over' | 'under') => {
    if (!overUnderCurrent) {
      resetOverUnder()
      return
    }

    const nextCard = drawCard()
    if (!nextCard) return

    const prevStreak = overUnderStreak
    const currentValue = getCardValue(overUnderCurrent, direction)
    const nextValue = getCardValue(nextCard, direction)
    const correct =
      direction === 'over' ? nextValue > currentValue : direction === 'under' ? nextValue < currentValue : false

    setOverUnderLast(nextCard)

    if (correct) {
      setOverUnderPenalty(null)
      setOverUnderStreak((prev) => {
        const updated = prev + 1
        if (updated >= OVER_UNDER_TARGET) {
          setOverUnderMessage('3 rigtige – sendt videre! Start forfra.')
          return 0
        }
        setOverUnderMessage(`Rigtigt! ${updated}/${OVER_UNDER_TARGET}`)
        return updated
      })
    } else {
      const penalty = prevStreak + 1
      setOverUnderPenalty(penalty)
      setOverUnderStreak(0)
      setOverUnderMessage(`Forkert – ${penalty} slurk${penalty === 1 ? '' : 'e'}`)
    }

    setOverUnderCurrent(nextCard)
  }

  const triggerHeroAction = (id: HeroButtonId, action: () => void) => {
    setPressedButton(id)
    action()
    if (heroFeedbackTimeout.current) {
      clearTimeout(heroFeedbackTimeout.current)
    }
    heroFeedbackTimeout.current = window.setTimeout(() => {
      setPressedButton((prev) => (prev === id ? null : prev))
    }, 400)
  }

  const resetHold = () => {
    if (holdAnimationFrame.current) {
      cancelAnimationFrame(holdAnimationFrame.current)
      holdAnimationFrame.current = null
    }
    holdStartTimestamp.current = null
    holdActionRef.current = null
    holdIdRef.current = null
    setHoldProgress(0)
    setHoldTarget(null)
  }

  const finishHold = () => {
    const action = holdActionRef.current
    const id = holdIdRef.current
    resetHold()
    if (id && action) {
      triggerHeroAction(id, action)
    }
  }

  const startHold = (id: HeroButtonId, action: () => void) => {
    resetHold()
    holdIdRef.current = id
    holdActionRef.current = action
    holdStartTimestamp.current = performance.now()
    setHoldTarget(id)
    setHoldProgress(0)

    const step = (timestamp: number) => {
      if (holdStartTimestamp.current == null) return
      const elapsed = timestamp - holdStartTimestamp.current
      const progress = Math.min(elapsed / HOLD_DURATION_MS, 1)
      setHoldProgress(progress)
      if (progress >= 1) {
        finishHold()
        return
      }
      holdAnimationFrame.current = requestAnimationFrame(step)
    }

    holdAnimationFrame.current = requestAnimationFrame(step)
  }

  const handleHoldPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    id: HeroButtonId,
    action: () => void,
    disabled: boolean,
  ) => {
    if (disabled) return
    event.preventDefault()
    startHold(id, action)
  }

  const handleHoldPointerEnd = () => {
    if (holdStartTimestamp.current == null) return
    resetHold()
  }

  const getHoldStyle = (id: HeroButtonId): HoldStyle => ({
    '--hold-progress': holdTarget === id ? holdProgress : 0,
  })

  const getHoldLabel = (id: HeroButtonId) => {
    if (holdTarget === id) {
      const percent = Math.min(Math.round(holdProgress * 100), 100)
      return percent >= 100 ? 'Slip for at udføre' : `Holder… ${percent}%`
    }
    return ''
  }

  const handleSetActiveStop = (stopId: string) => {
    updateActiveStop(stopId, true)
  }

  const handleAdminUnlock = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (adminPrompt === ADMIN_CODE) {
      setAdminUnlocked(true)
      setShowAdminPrompt(false)
      setAdminPrompt('')
    } else {
      setAdminPrompt('')
      alert('Forkert kode')
    }
  }

  const preventContextMenu = (event: React.MouseEvent) => {
    event.preventDefault()
  }

  return (
    <div className={`app mood-${moodLevel}`}>
      <div className="page-title">
        <button
          className="title-login"
          type="button"
          onClick={() => setIsLoginOpen((prev) => !prev)}
          title={currentUser ? `Logget ind som ${currentUser.name}` : 'Log ind / Opret'}
        >
          <span>{currentUser ? 'Jule Crawl er i gang' : 'Deltag i Julecrawl'}</span>
          {currentUser && <small>Logget ind som {currentUser.name}</small>}
        </button>
        {isLoginOpen && (
          <div className="login-dropdown page-dropdown">
            {currentUser && (
              <div className="current-user">
                <p>Logget ind som</p>
                <strong>{currentUser.name}</strong>
                <button
                  className="ghost small"
                  type="button"
                  onClick={() => {
                    setCurrentUserId(null)
                    setIsLoginOpen(false)
                  }}
                >
                  Log ud
                </button>
              </div>
            )}
            <form className="login-form" onSubmit={handleLogin}>
              <input
                value={nameInput}
                onChange={(event) => setNameInput(event.target.value)}
                placeholder="Skriv dit navn"
                aria-label="Navn"
              />
              <button type="submit">Gem</button>
            </form>
            <p className="muted small">Eller vælg en eksisterende deltager:</p>
            <div className="participant-list">
              {participants.map((participant) => (
                <div key={participant.id} className="participant-row">
                  <button
                    className={`tag ${participant.id === currentUserId ? 'active' : ''}`}
                    type="button"
                    onClick={() => {
                      setCurrentUserId(participant.id)
                      setIsLoginOpen(false)
                    }}
                  >
                    {participant.name}
                  </button>
                  {adminUnlocked && (
                    <button
                      className="ghost small danger"
                      type="button"
                      onClick={() => deleteParticipant(participant.id)}
                      title="Slet deltager"
                    >
                      Slet
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="content-wrap">
        <div className={`content-inner ${isLocked ? 'locked' : ''}`}>
          <div className="top-bar">
            <div className="retro-combo">
              <div className="retro-card">
                <p>Næste afgang</p>
                <div className="retro-value">
                  <span className={timerTarget && countdownMs === 0 ? 'alert' : ''}>
                    {countdownDisplay}
                  </span>
                </div>
                <small className="retro-note">
                  Ankommet: {activeStop?.name ?? 'Ingen aktive stop'}
                </small>
                <small className="retro-note subtle">
                  {nextStop ? `Næste sted: ${nextStop.name}` : 'Alle stop gennemført'}
                </small>
              </div>
              <div className="retro-divider" aria-hidden="true" />
              <div className="retro-card">
                <p>Øller drukket i dag</p>
                <div className="retro-value">
                  <span>{drinkLog.length.toString().padStart(3, '0')}</span>
                </div>
                <small className="retro-note">af holdet</small>
              </div>
            </div>
            <div className="mood-meter">
              <p>Stemning</p>
              <div className="mood-track" aria-label="Jule termometer">
                <div
                  className={`mood-fill level-${moodLevel}`}
                  style={{ width: `${moodProgress}%` }}
                />
              </div>
              <div className="mood-meta">
                <strong>{moodProgress}%</strong>
                <span>
                  {(() => {
                    switch (moodLevel) {
                      case 6:
                        return '100!! Søren-Christian-fest!'
                      case 5:
                        return 'Julemanden drikker'
                      case 4:
                        return 'Julekaos'
                      case 3:
                        return 'Festlig'
                      case 2:
                        return 'Lun'
                      case 1:
                        return 'Opvarmning'
                      default:
                        return 'Opvarmning'
                    }
                  })()}
                </span>
              </div>
            </div>
          </div>

          <header className="hero">
            <div className="hero-grid">
              <div className="hero-buttons">
                <button
                  className={`hero-btn ${pressedButton === 'beer' ? 'pressed' : ''}`}
                  disabled={!currentUser}
                  onPointerDown={(event) =>
                    handleHoldPointerDown(event, 'beer', logDrink, !currentUser)
                  }
                  onPointerUp={handleHoldPointerEnd}
                  onPointerLeave={handleHoldPointerEnd}
                  onPointerCancel={handleHoldPointerEnd}
                  onContextMenu={preventContextMenu}
                  style={getHoldStyle('beer')}
                  title={!currentUser ? 'Log ind for at tracke øl' : 'Hold for at logge'}
                >
                  <span>Øl drukket</span>
                  {getHoldLabel('beer') && <small>{getHoldLabel('beer')}</small>}
                </button>
                <button
                  className={`hero-btn ${pressedButton === 'arrival' ? 'pressed' : ''}`}
                  disabled={!activeStop || isArrivalOnCooldown}
                  onPointerDown={(event) =>
                    handleHoldPointerDown(
                      event,
                      'arrival',
                      handleArrival,
                      !activeStop || isArrivalOnCooldown,
                    )
                  }
                  onPointerUp={handleHoldPointerEnd}
                  onPointerLeave={handleHoldPointerEnd}
                  onPointerCancel={handleHoldPointerEnd}
                  onContextMenu={preventContextMenu}
                  style={getHoldStyle('arrival')}
                  title={
                    !activeStop
                      ? 'Vælg et aktivt stop'
                      : isArrivalOnCooldown
                        ? 'Cooldown aktiv'
                        : 'Hold for at markere ankomst'
                  }
                >
                  <span>Ankommet</span>
                  {getHoldLabel('arrival') && <small>{getHoldLabel('arrival')}</small>}
                  {!getHoldLabel('arrival') && isArrivalOnCooldown && (
                    <small>Cooldown {formatDuration(arrivalCooldownRemaining)}</small>
                  )}
                </button>
                <button
                  className={`hero-btn ${pressedButton === 'round' ? 'pressed' : ''}`}
                  disabled={!participants.length}
                  onPointerDown={(event) =>
                    handleHoldPointerDown(event, 'round', pickNextRound, !participants.length)
                  }
                  onPointerUp={handleHoldPointerEnd}
                  onPointerLeave={handleHoldPointerEnd}
                  onPointerCancel={handleHoldPointerEnd}
                  onContextMenu={preventContextMenu}
                  style={getHoldStyle('round')}
                >
                  <span>Næste omgang?</span>
                  {getHoldLabel('round') && <small>{getHoldLabel('round')}</small>}
                </button>
              </div>
              <div className="round-winner">
                <div className={`playing-card ${lastRoundWinner ? '' : 'empty'}`}>
                  <div className="card-corner top">🍻</div>
                  <div className="card-face">
                    {lastRoundWinner ? (
                      <>
                        <small>Vinder</small>
                        <strong>{lastRoundWinner.name}</strong>
                        <div className="card-emblem">🍺</div>
                        <span className="card-meta">giver denne omgang</span>
                      </>
                    ) : (
                      <span className="card-placeholder">Tryk “Næste omgang?”</span>
                    )}
                  </div>
                  <div className="card-corner bottom">🍻</div>
                </div>
                {isRoundOnCooldown && (
                  <small className="muted tiny cooldown-note">
                    Lodtrækning cooldown ({formatDuration(roundCooldownRemaining)})
                  </small>
                )}
              </div>
            </div>
          </header>

          <div className="grid">
            <section className="panel">
              <h2>Ranking</h2>
              <p className="panel-sub">Live leaderboard for flest øl.</p>
              <ol className="ranking">
                {ranking.map((participant, index) => (
                  <li key={participant.id}>
                    <span>
                      {index + 1}. {participant.name}
                    </span>
                    <strong>{participant.beers}</strong>
                  </li>
                ))}
              </ol>
            </section>

            <section className="panel span-2">
              <div className="panel-header">
                <h2>Juleruten</h2>
                <div className="admin-tools">
                  {adminUnlocked ? (
                    <button
                      className="ghost small"
                      onClick={() => {
                        setAdminUnlocked(false)
                        setShowAdminPrompt(false)
                      }}
                    >
                      Lås
                    </button>
                  ) : (
                    <button
                      className="ghost small"
                      onClick={() => setShowAdminPrompt((prev) => !prev)}
                      aria-label="Lås op"
                    >
                      🔑
                    </button>
                  )}
                </div>
              </div>
              {showAdminPrompt && !adminUnlocked && (
                <form className="admin-form" onSubmit={handleAdminUnlock}>
                  <input
                    type="password"
                    placeholder="Arrangørkode"
                    value={adminPrompt}
                    onChange={(event) => setAdminPrompt(event.target.value)}
                  />
                  <button type="submit" className="ghost small">
                    Lås op
                  </button>
                </form>
              )}
              <ul className="route-list">
                {routeStops.map((stop, index) => (
                  <li
                    key={stop.id}
                    className={`${stop.completed ? 'done' : ''} ${
                      activeStopId === stop.id ? 'active' : ''
                    }`}
                  >
                    <div className="route-index">{index + 1}</div>
                    <div>
                      <strong>{stop.name}</strong>
                      <p>{stop.address}</p>
                      {stop.note && <small>{stop.note}</small>}
                    </div>
                    <div className="route-actions">
                      {adminUnlocked ? (
                        <>
                          <label>
                            <input
                              type="checkbox"
                              checked={stop.completed}
                              onChange={() => markStopComplete(stop.id)}
                            />{' '}
                            Færdig
                          </label>
                          <button
                            className="ghost"
                            onClick={() => handleSetActiveStop(stop.id)}
                            disabled={activeStopId === stop.id}
                          >
                            {activeStopId === stop.id ? 'Aktiv' : 'Gør til aktiv'}
                          </button>
                        </>
                      ) : (
                        <span className="muted small-text">🔒 Låst</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            {adminUnlocked && (
              <section className="panel">
                <h2>Admin</h2>
                <div className="timer">
                <p>Næste afgang</p>
                <strong className={timerTarget && countdownMs === 0 ? 'alert' : ''}>
                  {countdownDisplay}
                </strong>
                {activeStop && (
                  <p className="muted">
                    Destination: <span>{activeStop.name}</span>
                  </p>
                )}
                  <div className="timer-controls">
                    <button onClick={() => startTimer(1)} disabled={!adminUnlocked}>
                      1 min
                    </button>
                    <button onClick={() => startTimer(15)} disabled={!adminUnlocked}>
                      15 min
                    </button>
                    <button onClick={() => startTimer(20)} disabled={!adminUnlocked}>
                      20 min
                    </button>
                    <button onClick={() => extendTimer(5)} disabled={!adminUnlocked}>
                      +5 min
                    </button>
                  <button className="ghost" onClick={resetTimer} disabled={!adminUnlocked}>
                    Afslut sted
                  </button>
                  </div>
                  {timerTarget && (
                    <small>
                      Startet {formatTime(timerTarget - timerDuration)} • Slutter{' '}
                      {formatTime(timerTarget)}
                    </small>
                  )}
                  <div className="timer-controls secondary">
                    <button
                      className={`ghost hold-button ${pressedButton === 'reset' ? 'pressed' : ''}`}
                      type="button"
                      onPointerDown={(event) =>
                        handleHoldPointerDown(event, 'reset', resetRanking, false)
                      }
                      onPointerUp={handleHoldPointerEnd}
                      onPointerLeave={handleHoldPointerEnd}
                      onPointerCancel={handleHoldPointerEnd}
                      onContextMenu={preventContextMenu}
                      style={getHoldStyle('reset')}
                      title="Hold for at nulstille ranking"
                    >
                      <span>Nulstil ranking</span>
                      {getHoldLabel('reset') && (
                        <small className="hold-hint">{getHoldLabel('reset')}</small>
                      )}
                    </button>
                  </div>
                  <div className="timer-controls secondary mood-controls">
                    <span className="muted small">Sæt stemning (test)</span>
                    <div className="mood-test-buttons">
                      {[0, 40, 60, 70, 80, 100].map((value) => (
                        <button
                          key={value}
                          className="ghost small"
                          type="button"
                          onClick={() => setMood(value)}
                        >
                          {value}%
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            )}
          </div>

          <section className="panel span-2 game-panel">
            <div className="panel-header">
              <div>
                <h2>Over eller under</h2>
                <p className="panel-sub">
                  Gæt næste kort. {OVER_UNDER_TARGET} rigtige i træk giver “send videre”. Joker er altid
                  højest/lavest afhængigt af dit gæt.
                </p>
              </div>
              <div className="ace-mode">
                <label>
                  Es:
                  <select
                    value={aceMode}
                    onChange={(event) => setAceMode(event.target.value as typeof aceMode)}
                  >
                    <option value="both">Lav/ høj</option>
                    <option value="high">Kun høj</option>
                    <option value="low">Kun lav</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="game-body">
              <div className="card-board">
                <div className="card-stack">
                  <div className="card-label">Nuværende kort</div>
                  {overUnderCurrent ? (
                    <div className={`mini-card ${overUnderCurrent.rank === 'Joker' ? 'joker' : ''}`}>
                      <span className="corner top">
                        {overUnderCurrent.rank}
                        <em>{suitIcon[overUnderCurrent.suit]}</em>
                      </span>
                      <span className="center">
                        {overUnderCurrent.rank} {suitIcon[overUnderCurrent.suit]}
                      </span>
                      <span className="corner bottom">
                        {overUnderCurrent.rank}
                        <em>{suitIcon[overUnderCurrent.suit]}</em>
                      </span>
                    </div>
                  ) : (
                    <div className="mini-card placeholder">-</div>
                  )}
                  {overUnderLast && (
                    <div className="last-card">
                      <small>Sidste træk</small>
                      <strong>
                        {overUnderLast.rank} {suitIcon[overUnderLast.suit]}
                      </strong>
                    </div>
                  )}
                </div>

                <div className="guess-actions">
                  <div className="streak">
                    <p>Rigtige i træk</p>
                    <strong>{overUnderProgress}</strong>
                  </div>
                  <div className="guess-buttons">
                    <button onClick={() => handleOverUnderGuess('over')}>Over</button>
                    <button onClick={() => handleOverUnderGuess('under')}>Under</button>
                  </div>
                  <div className="game-feedback">
                    <strong>{overUnderMessage}</strong>
                    {overUnderPenalty !== null && (
                      <small className="muted">
                        {overUnderPenalty} slurk{overUnderPenalty === 1 ? '' : 'e'}
                      </small>
                    )}
                  </div>
                  <div className="game-controls">
                    <button className="ghost small" onClick={resetOverUnder}>
                      Nulstil spil
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default App
