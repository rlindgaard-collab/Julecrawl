import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, FormEvent, PointerEvent as ReactPointerEvent } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import './App.css'
import { db } from './lib/database'
import type { RouteStop, PongGame } from './lib/database'

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


type HeroButtonId = 'beer' | 'arrival' | 'round' | 'reset'
type HoldStyle = CSSProperties & { '--hold-progress'?: number }

const HOLD_DURATION_MS = 1500
const ARRIVAL_COOLDOWN_MS = 30 * 1000
const ROUND_COOLDOWN_MS = 2 * 60 * 1000
const ADMIN_CODE = 'snag'
const OVER_UNDER_TARGET = 3
const MOOD_MAX = 100


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
  const [participants, setParticipants] = useState<Participant[]>([])
  const [routeStops, setRouteStops] = useState<RouteStop[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [nameInput, setNameInput] = useState('')
  const [drinkLog, setDrinkLog] = useState<DrinkEntry[]>([])
  const [timerTarget, setTimerTarget] = useState<number | null>(null)
  const [timerDuration, setTimerDuration] = useState(0)
  const [activeStopId, setActiveStopId] = useState<string | null>(null)
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
  const [overUnderActivePlayerId, setOverUnderActivePlayerId] = useState<string | null>(null)
  const [aceMode, setAceMode] = useState<'low' | 'high' | 'both'>('both')
  const [isLoading, setIsLoading] = useState(true)
  const [isLoginOpen, setIsLoginOpen] = useState(false)
  const [pressedButton, setPressedButton] = useState<HeroButtonId | null>(null)
  const [holdTarget, setHoldTarget] = useState<HeroButtonId | null>(null)
  const [holdProgress, setHoldProgress] = useState(0)
  const [adminUnlocked, setAdminUnlocked] = useState(false)
  const [adminPrompt, setAdminPrompt] = useState('')
  const [showAdminPrompt, setShowAdminPrompt] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [pongGame, setPongGame] = useState<PongGame | null>(null)
  const [pongPlayer1, setPongPlayer1] = useState<string>('')
  const [pongPlayer2, setPongPlayer2] = useState<string>('')
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

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [participantsData, drinkLogData, routeData, stateData] = await Promise.all([
          db.getParticipants(),
          db.getDrinkLog(),
          db.getRouteStops(),
          db.getCrawlState(),
        ])

        setParticipants(
          participantsData.map((p) => ({
            id: p.id,
            name: p.name,
            beers: p.beers,
            createdAt: new Date(p.created_at).getTime(),
          }))
        )
        setDrinkLog(
          drinkLogData.map((d) => ({
            id: d.id,
            participantId: d.participant_id,
            timestamp: new Date(d.timestamp).getTime(),
          }))
        )
        setRouteStops(routeData)

        setTimerTarget(stateData.timer_target ? new Date(stateData.timer_target).getTime() : null)
        setTimerDuration(stateData.timer_duration)
        setActiveStopId(stateData.active_stop_id)
        setMoodScore(stateData.mood_score)
        setArrivalCooldownUntil(stateData.arrival_cooldown_until ? new Date(stateData.arrival_cooldown_until).getTime() : null)
        setRoundCooldownUntil(stateData.round_cooldown_until ? new Date(stateData.round_cooldown_until).getTime() : null)
        if (stateData.last_round_winner_id) {
          setRoundHistory([stateData.last_round_winner_id])
        }
        setOverUnderStreak(stateData.over_under_streak)
        setOverUnderCurrent(stateData.over_under_current_card)
        setOverUnderLast(stateData.over_under_last_card)
        setOverUnderDeck(stateData.over_under_deck || [])
        setOverUnderMessage(stateData.over_under_message)
        setOverUnderPenalty(stateData.over_under_penalty)
        setOverUnderActivePlayerId(stateData.over_under_active_player_id)
        setAceMode(stateData.ace_mode)
      } catch (error) {
        console.error('Error loading data:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadInitialData()

    const unsubParticipants = db.subscribeToParticipants((participantsData) => {
      setParticipants(
        participantsData.map((p) => ({
          id: p.id,
          name: p.name,
          beers: p.beers,
          createdAt: new Date(p.created_at).getTime(),
        }))
      )
    })

    const unsubDrinkLog = db.subscribeToDrinkLog((drinkLogData) => {
      setDrinkLog(
        drinkLogData.map((d) => ({
          id: d.id,
          participantId: d.participant_id,
          timestamp: new Date(d.timestamp).getTime(),
        }))
      )
    })

    const unsubRouteStops = db.subscribeToRouteStops((routeData) => {
      setRouteStops(routeData)
    })

    const unsubCrawlState = db.subscribeToCrawlState((stateData) => {
      setTimerTarget(stateData.timer_target ? new Date(stateData.timer_target).getTime() : null)
      setTimerDuration(stateData.timer_duration)
      setActiveStopId(stateData.active_stop_id)
      setMoodScore(stateData.mood_score)
      setArrivalCooldownUntil(stateData.arrival_cooldown_until ? new Date(stateData.arrival_cooldown_until).getTime() : null)
      setRoundCooldownUntil(stateData.round_cooldown_until ? new Date(stateData.round_cooldown_until).getTime() : null)
      if (stateData.last_round_winner_id) {
        setRoundHistory([stateData.last_round_winner_id])
      }
      setOverUnderStreak(stateData.over_under_streak)
      setOverUnderCurrent(stateData.over_under_current_card)
      setOverUnderLast(stateData.over_under_last_card)
      setOverUnderDeck(stateData.over_under_deck || [])
      setOverUnderMessage(stateData.over_under_message)
      setOverUnderPenalty(stateData.over_under_penalty)
      setOverUnderActivePlayerId(stateData.over_under_active_player_id)
      setAceMode(stateData.ace_mode)
    })

    const loadPongGame = async () => {
      try {
        const activeGame = await db.getActivePongGame()
        setPongGame(activeGame)
      } catch (error) {
        console.error('Error loading pong game:', error)
      }
    }

    loadPongGame()

    const unsubPongGames = db.subscribeToPongGames(async () => {
      const activeGame = await db.getActivePongGame()
      setPongGame(activeGame)
    })

    return () => {
      unsubParticipants()
      unsubDrinkLog()
      unsubRouteStops()
      unsubCrawlState()
      unsubPongGames()
    }
  }, [])

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

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = nameInput.trim()
    if (!trimmed) return

    const existing = participants.find(
      (participant) => participant.name.toLowerCase() === trimmed.toLowerCase(),
    )

    if (existing) {
      setCurrentUserId(existing.id)
    } else {
      try {
        const newParticipant = await db.createParticipant(trimmed)
        setCurrentUserId(newParticipant.id)
      } catch (error) {
        console.error('Error creating participant:', error)
      }
    }

    setNameInput('')
    setIsLoginOpen(false)
  }

  const logDrink = async () => {
    if (!currentUser) return

    const optimisticDrink = {
      id: crypto.randomUUID(),
      participantId: currentUser.id,
      timestamp: Date.now(),
    }
    setDrinkLog((prev) => [...prev, optimisticDrink])
    setParticipants((prev) =>
      prev.map((p) => (p.id === currentUser.id ? { ...p, beers: p.beers + 1 } : p))
    )

    try {
      await db.logDrink(currentUser.id)
      await db.updateParticipantBeers(currentUser.id, currentUser.beers + 1)
      await bumpMood(1)
    } catch (error) {
      console.error('Error logging drink:', error)
      setDrinkLog((prev) => prev.filter((d) => d.id !== optimisticDrink.id))
      setParticipants((prev) =>
        prev.map((p) => (p.id === currentUser.id ? { ...p, beers: p.beers - 1 } : p))
      )
    }
  }

  const markStopComplete = async (stopId: string) => {
    const isActive = stopId === activeStopId
    const stop = routeStops.find(s => s.id === stopId)
    if (!stop) return

    try {
      await db.updateRouteStop(stopId, { completed: !stop.completed })

      if (isActive) {
        await resetTimer()
      }
    } catch (error) {
      console.error('Error updating stop:', error)
    }
  }

  const startTimer = async (minutes: number, override = false) => {
    if (!adminUnlocked && !override) return
    const duration = minutes * 60 * 1000
    const target = Date.now() + duration
    setTimerDuration(duration)
    setTimerTarget(target)

    try {
      await db.updateCrawlState({
        timer_duration: duration,
        timer_target: new Date(target).toISOString(),
      })
    } catch (error) {
      console.error('Error starting timer:', error)
    }
  }

  const extendTimer = async (minutes: number, override = false) => {
    if (!adminUnlocked && !override) return
    if (!timerTarget) {
      await startTimer(minutes, override)
      return
    }

    const additional = minutes * 60 * 1000
    const newDuration = timerDuration + additional
    const newTarget = timerTarget + additional

    setTimerDuration(newDuration)
    setTimerTarget(newTarget)

    try {
      await db.updateCrawlState({
        timer_duration: newDuration,
        timer_target: new Date(newTarget).toISOString(),
      })
    } catch (error) {
      console.error('Error extending timer:', error)
    }
  }

  const resetTimer = async (override = false) => {
    if (!adminUnlocked && !override) return
    setTimerTarget(null)
    setTimerDuration(0)

    try {
      await db.updateCrawlState({
        timer_target: null,
        timer_duration: 0,
      })
    } catch (error) {
      console.error('Error resetting timer:', error)
    }
  }

  const updateActiveStop = async (stopId: string | null, restartTimer: boolean) => {
    setActiveStopId(stopId)

    try {
      await db.updateCrawlState({ active_stop_id: stopId })

      if (!stopId) {
        await resetTimer(true)
        return
      }
      if (restartTimer) {
        await startTimer(30, true)
      }
    } catch (error) {
      console.error('Error updating active stop:', error)
    }
  }

  const pickNextRound = async () => {
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
    const cooldownTime = now + ROUND_COOLDOWN_MS
    setRoundCooldownUntil(cooldownTime)

    try {
      await db.updateCrawlState({
        last_round_winner_id: chosen.id,
        round_cooldown_until: new Date(cooldownTime).toISOString(),
      })
      await bumpMood(5)
    } catch (error) {
      console.error('Error picking next round:', error)
    }
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

  const handleArrival = async () => {
    if (isTimerRunning) return
    const now = Date.now()
    if (arrivalCooldownUntil && arrivalCooldownUntil > now) return
    if (isArrivalOnCooldown) return
    if (!activeStop) return

    const upcoming = nextStop

    try {
      await db.updateRouteStop(activeStop.id, { completed: true })

      if (upcoming) {
        await updateActiveStop(upcoming.id, true)
      } else {
        await updateActiveStop(null, false)
      }

      const cooldownTime = now + ARRIVAL_COOLDOWN_MS
      setArrivalCooldownUntil(cooldownTime)

      await db.updateCrawlState({
        arrival_cooldown_until: new Date(cooldownTime).toISOString(),
      })
      await bumpMood(5)
    } catch (error) {
      console.error('Error handling arrival:', error)
    }
  }

  const resetRanking = async () => {
    try {
      await db.clearDrinkLog()
      for (const p of participants) {
        await db.updateParticipantBeers(p.id, 0)
      }
    } catch (error) {
      console.error('Error resetting ranking:', error)
    }
  }

  const deleteParticipant = async (participantId: string) => {
    if (!adminUnlocked) return
    try {
      await db.deleteParticipant(participantId)
      setRoundHistory((prev) => prev.filter((id) => id !== participantId))
      setCurrentUserId((prev) => (prev === participantId ? null : prev))
    } catch (error) {
      console.error('Error deleting participant:', error)
    }
  }

  const bumpMood = async (amount: number) => {
    const newScore = Math.min(moodScore + amount, MOOD_MAX)
    setMoodScore(newScore)

    try {
      await db.updateCrawlState({ mood_score: newScore })
    } catch (error) {
      console.error('Error updating mood:', error)
    }
  }

  const setMood = async (value: number) => {
    if (!adminUnlocked) return
    const clamped = Math.min(Math.max(value, 0), MOOD_MAX)
    setMoodScore(clamped)

    try {
      await db.updateCrawlState({ mood_score: clamped })
    } catch (error) {
      console.error('Error setting mood:', error)
    }
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

  const resetOverUnder = async () => {
    const fresh = shuffleDeck(createDeck())
    const [first, ...rest] = fresh
    setOverUnderDeck(rest)
    setOverUnderCurrent(first ?? null)
    setOverUnderLast(null)
    setOverUnderStreak(0)
    setOverUnderMessage('Gæt over eller under for næste kort')
    setOverUnderPenalty(null)

    try {
      await db.updateCrawlState({
        over_under_deck: rest,
        over_under_current_card: first ?? null,
        over_under_last_card: null,
        over_under_streak: 0,
        over_under_message: 'Gæt over eller under for næste kort',
        over_under_penalty: null,
      })
    } catch (error) {
      console.error('Error resetting over/under:', error)
    }
  }

  const handleOverUnderGuess = async (direction: 'over' | 'under') => {
    if (!overUnderCurrent) {
      await resetOverUnder()
      return
    }

    let deck = overUnderDeck
    if (!deck.length) {
      deck = shuffleDeck(createDeck())
    }
    const [nextCard, ...remainingDeck] = deck
    if (!nextCard) return

    setOverUnderDeck(remainingDeck)

    const prevStreak = overUnderStreak
    const currentValue = getCardValue(overUnderCurrent, direction)
    const nextValue = getCardValue(nextCard, direction)
    const correct =
      direction === 'over' ? nextValue > currentValue : direction === 'under' ? nextValue < currentValue : false

    setOverUnderLast(nextCard)
    setOverUnderCurrent(nextCard)

    let newStreak = prevStreak
    let newMessage = ''
    let newPenalty = overUnderPenalty

    if (correct) {
      newPenalty = null
      newStreak = prevStreak + 1
      if (newStreak >= OVER_UNDER_TARGET) {
        newMessage = '3 rigtige – sendt videre! Start forfra.'
        newStreak = 0
      } else {
        newMessage = `Rigtigt! ${newStreak}/${OVER_UNDER_TARGET}`
      }
      setOverUnderPenalty(null)
      setOverUnderStreak(newStreak)
      setOverUnderMessage(newMessage)
    } else {
      newPenalty = prevStreak + 1
      newStreak = 0
      newMessage = `Forkert – ${newPenalty} slurk${newPenalty === 1 ? '' : 'e'}`
      setOverUnderPenalty(newPenalty)
      setOverUnderStreak(0)
      setOverUnderMessage(newMessage)
    }

    try {
      await db.updateCrawlState({
        over_under_deck: remainingDeck,
        over_under_current_card: nextCard,
        over_under_last_card: nextCard,
        over_under_streak: newStreak,
        over_under_message: newMessage,
        over_under_penalty: newPenalty,
      })
    } catch (error) {
      console.error('Error updating over/under game:', error)
    }
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

  const handleSetActiveStop = async (stopId: string) => {
    await updateActiveStop(stopId, true)
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

  const handleAceModeChange = async (newMode: 'low' | 'high' | 'both') => {
    setAceMode(newMode)
    try {
      await db.updateCrawlState({ ace_mode: newMode })
    } catch (error) {
      console.error('Error updating ace mode:', error)
    }
  }

  const handleActivePlayerChange = async (playerId: string) => {
    const newPlayerId = playerId || null
    setOverUnderActivePlayerId(newPlayerId)
    try {
      await db.updateCrawlState({ over_under_active_player_id: newPlayerId })
    } catch (error) {
      console.error('Error updating active player:', error)
    }
  }

  const handlePassToNextPlayer = async () => {
    if (!overUnderActivePlayerId) return

    const currentIndex = participants.findIndex(p => p.id === overUnderActivePlayerId)
    if (currentIndex === -1) return

    const nextIndex = (currentIndex + 1) % participants.length
    const nextPlayer = participants[nextIndex]

    if (nextPlayer) {
      setOverUnderActivePlayerId(nextPlayer.id)
      try {
        await db.updateCrawlState({ over_under_active_player_id: nextPlayer.id })
      } catch (error) {
        console.error('Error passing to next player:', error)
      }
    }
  }

  const startPongGame = async () => {
    if (!pongPlayer1 || !pongPlayer2 || pongPlayer1 === pongPlayer2) {
      return
    }

    try {
      const game = await db.createPongGame(pongPlayer1, pongPlayer2)
      if (game) {
        setPongPlayer1('')
        setPongPlayer2('')
      }
    } catch (error) {
      console.error('Error starting pong game:', error)
    }
  }

  const endPongGame = async () => {
    if (!pongGame) return

    try {
      const winnerId = pongGame.player1_score > pongGame.player2_score
        ? pongGame.player1_id
        : pongGame.player2_id
      await db.finishPongGame(pongGame.id, winnerId)
    } catch (error) {
      console.error('Error ending pong game:', error)
    }
  }

  const [localPongState, setLocalPongState] = useState<{
    ball_x: number
    ball_y: number
    ball_dx: number
    ball_dy: number
    paddle1_y: number
    paddle2_y: number
    player1_score: number
    player2_score: number
  } | null>(null)
  const [pongCountdown, setPongCountdown] = useState<number | null>(null)

  useEffect(() => {
    if (!pongGame || pongGame.status !== 'active') {
      setLocalPongState(null)
      setPongCountdown(null)
      return
    }

    setLocalPongState({
      ball_x: pongGame.ball_x,
      ball_y: pongGame.ball_y,
      ball_dx: 0,
      ball_dy: 0,
      paddle1_y: pongGame.paddle1_y,
      paddle2_y: pongGame.paddle2_y,
      player1_score: pongGame.player1_score,
      player2_score: pongGame.player2_score
    })

    setPongCountdown(3)

    const PADDLE_HEIGHT = 15
    const PADDLE_WIDTH = 3
    const BALL_SIZE = 2
    const WINNING_SCORE = 5

    const gameLoop = setInterval(() => {
      setLocalPongState(prev => {
        if (!prev || !pongGame) return prev

        let { ball_x, ball_y, ball_dx, ball_dy, paddle1_y, paddle2_y, player1_score, player2_score } = prev

        ball_x += ball_dx * 0.6
        ball_y += ball_dy * 0.6

        if (ball_y <= 1) {
          ball_dy = Math.abs(ball_dy)
          ball_y = 1
        }
        if (ball_y >= 99) {
          ball_dy = -Math.abs(ball_dy)
          ball_y = 99
        }

        if (ball_x - BALL_SIZE / 2 <= PADDLE_WIDTH) {
          const paddleTop = paddle1_y - PADDLE_HEIGHT / 2
          const paddleBottom = paddle1_y + PADDLE_HEIGHT / 2

          if (ball_y >= paddleTop && ball_y <= paddleBottom && ball_dx < 0) {
            ball_dx = Math.abs(ball_dx) * 1.05
            const hitPos = (ball_y - paddle1_y) / (PADDLE_HEIGHT / 2)
            ball_dy += hitPos * 0.8
            ball_x = PADDLE_WIDTH + BALL_SIZE / 2
          }
        }

        if (ball_x <= 0) {
          player2_score++
          ball_x = 50
          ball_y = 50
          ball_dx = 0
          ball_dy = 0
          setPongCountdown(3)
        }

        if (ball_x + BALL_SIZE / 2 >= 100 - PADDLE_WIDTH) {
          const paddleTop = paddle2_y - PADDLE_HEIGHT / 2
          const paddleBottom = paddle2_y + PADDLE_HEIGHT / 2

          if (ball_y >= paddleTop && ball_y <= paddleBottom && ball_dx > 0) {
            ball_dx = -Math.abs(ball_dx) * 1.05
            const hitPos = (ball_y - paddle2_y) / (PADDLE_HEIGHT / 2)
            ball_dy += hitPos * 0.8
            ball_x = 100 - PADDLE_WIDTH - BALL_SIZE / 2
          }
        }

        if (ball_x >= 100) {
          player1_score++
          ball_x = 50
          ball_y = 50
          ball_dx = 0
          ball_dy = 0
          setPongCountdown(3)
        }

        ball_dy = Math.max(-2.5, Math.min(2.5, ball_dy))
        ball_dx = Math.max(-3, Math.min(3, ball_dx))

        if (player1_score >= WINNING_SCORE || player2_score >= WINNING_SCORE) {
          const winnerId = player1_score >= WINNING_SCORE ? pongGame.player1_id : pongGame.player2_id
          db.finishPongGame(pongGame.id, winnerId)
        }

        return { ball_x, ball_y, ball_dx, ball_dy, paddle1_y, paddle2_y, player1_score, player2_score }
      })
    }, 16)

    const syncInterval = setInterval(async () => {
      if (localPongState && pongGame) {
        try {
          await db.updatePongGame(pongGame.id, localPongState)
        } catch (error) {
          console.error('Error syncing pong game:', error)
        }
      }
    }, 500)

    return () => {
      clearInterval(gameLoop)
      clearInterval(syncInterval)
    }
  }, [pongGame])

  const movePaddle = (player: 1 | 2, direction: 'up' | 'down') => {
    setLocalPongState(prev => {
      if (!prev) return prev

      const currentY = player === 1 ? prev.paddle1_y : prev.paddle2_y
      const newY = direction === 'up' ? Math.max(10, currentY - 3) : Math.min(90, currentY + 3)

      return player === 1
        ? { ...prev, paddle1_y: newY }
        : { ...prev, paddle2_y: newY }
    })
  }

  useEffect(() => {
    if (pongCountdown === null || pongCountdown <= 0) return

    const timer = setTimeout(() => {
      const newCount = pongCountdown - 1
      if (newCount > 0) {
        setPongCountdown(newCount)
      } else {
        setPongCountdown(null)
        setLocalPongState(prev => {
          if (!prev) return prev
          const direction = Math.random() > 0.5 ? 1 : -1
          return {
            ...prev,
            ball_dx: 1.2 * direction,
            ball_dy: (Math.random() - 0.5) * 2
          }
        })
      }
    }, 1000)

    return () => clearTimeout(timer)
  }, [pongCountdown])

  if (isLoading) {
    return (
      <div className="app">
        <div className="page-title">
          <div className="title-login">
            <span>Indlæser...</span>
          </div>
        </div>
      </div>
    )
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

            <section className="panel">
              <h2>Inviter makkere</h2>
              <p className="panel-sub">Få flere med på holdet.</p>
              <button
                className="primary"
                type="button"
                onClick={() => setShowInviteModal(true)}
              >
                Vis QR-kode
              </button>
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
                    {!activeStopId && routeStops.length > 0 && (
                      <button
                        onClick={() => {
                          const firstStop = routeStops[0];
                          if (firstStop) {
                            updateActiveStop(firstStop.id, true);
                          }
                        }}
                        className="primary"
                      >
                        🚀 Start ruten
                      </button>
                    )}
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
                  <button className="ghost" onClick={() => resetTimer()} disabled={!adminUnlocked}>
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
            <div className="game-section-header">
              <h2 className="game-section-title">🎲 Drukspil</h2>
            </div>
            <div className="game-player-select">
              <label>Aktiv spiller:</label>
              <select
                value={overUnderActivePlayerId || ''}
                onChange={(event) => handleActivePlayerChange(event.target.value)}
              >
                <option value="">Vælg spiller</option>
                {participants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="panel-header">
              <div>
                <h2>Over eller under</h2>
                <p className="panel-sub">
                  Gæt næste kort. {OVER_UNDER_TARGET} rigtige i træk giver "send videre". Joker er altid
                  højest/lavest afhængigt af dit gæt.
                </p>
              </div>
              <div className="ace-mode">
                <label>
                  Es:
                  <select
                    value={aceMode}
                    onChange={(event) => handleAceModeChange(event.target.value as typeof aceMode)}
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
                    <button
                      onClick={() => handleOverUnderGuess('over')}
                      disabled={overUnderActivePlayerId !== null && overUnderActivePlayerId !== currentUserId}
                    >
                      Over
                    </button>
                    <button
                      onClick={() => handleOverUnderGuess('under')}
                      disabled={overUnderActivePlayerId !== null && overUnderActivePlayerId !== currentUserId}
                    >
                      Under
                    </button>
                  </div>
                  {overUnderActivePlayerId && overUnderActivePlayerId === currentUserId && (
                    <div className="pass-control">
                      <button className="ghost small" onClick={handlePassToNextPlayer}>
                        Send videre til næste
                      </button>
                    </div>
                  )}
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

          <section className="panel span-2 game-panel">
            <div className="game-section-header">
              <h2 className="game-section-title">🎮 Classic Pong</h2>
            </div>

            {!pongGame ? (
              <div className="beer-pong-setup">
                <p className="panel-sub">Start et klassisk Pong spil mellem to spillere</p>
                <div className="beer-pong-player-select">
                  <div className="player-selector">
                    <label>Spiller 1 (venstre):</label>
                    <select
                      value={pongPlayer1}
                      onChange={(e) => setPongPlayer1(e.target.value)}
                    >
                      <option value="">Vælg spiller</option>
                      {participants.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="vs-divider">VS</div>
                  <div className="player-selector">
                    <label>Spiller 2 (højre):</label>
                    <select
                      value={pongPlayer2}
                      onChange={(e) => setPongPlayer2(e.target.value)}
                    >
                      <option value="">Vælg spiller</option>
                      {participants.map((p) => (
                        <option key={p.id} value={p.id} disabled={p.id === pongPlayer1}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  className="primary"
                  onClick={startPongGame}
                  disabled={!pongPlayer1 || !pongPlayer2 || pongPlayer1 === pongPlayer2}
                >
                  Start spil
                </button>
              </div>
            ) : (
              <div className="beer-pong-active">
                {pongGame.status === 'finished' ? (
                  <div className="beer-pong-finished">
                    <h3>🏆 Spil afsluttet!</h3>
                    <p className="winner-announcement">
                      Vinderen er: <strong>{participants.find(p => p.id === pongGame.winner_id)?.name}</strong>
                    </p>
                    <p className="final-score">
                      {pongGame.player1_score} - {pongGame.player2_score}
                    </p>
                    <button className="primary" onClick={() => setPongGame(null)}>
                      Start nyt spil
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="pong-game-area">
                      <div className="pong-score-header">
                        <div className="pong-player-info">
                          <h3>{participants.find(p => p.id === pongGame.player1_id)?.name}</h3>
                          <div className="pong-score">{localPongState?.player1_score ?? pongGame.player1_score}</div>
                        </div>
                        <div className="pong-divider">-</div>
                        <div className="pong-player-info">
                          <h3>{participants.find(p => p.id === pongGame.player2_id)?.name}</h3>
                          <div className="pong-score">{localPongState?.player2_score ?? pongGame.player2_score}</div>
                        </div>
                      </div>

                      <div className="pong-canvas">
                        <div
                          className="pong-paddle pong-paddle-left"
                          style={{ top: `${localPongState?.paddle1_y ?? pongGame.paddle1_y}%` }}
                        />
                        <div
                          className="pong-ball"
                          style={{
                            left: `${localPongState?.ball_x ?? pongGame.ball_x}%`,
                            top: `${localPongState?.ball_y ?? pongGame.ball_y}%`
                          }}
                        />
                        <div
                          className="pong-paddle pong-paddle-right"
                          style={{ top: `${localPongState?.paddle2_y ?? pongGame.paddle2_y}%` }}
                        />
                        <div className="pong-center-line" />
                        {pongCountdown !== null && (
                          <div className="pong-countdown">
                            {pongCountdown}
                          </div>
                        )}
                      </div>

                      <div className="pong-controls-grid">
                        <div className="pong-control-section">
                          <p className="pong-control-label">
                            {participants.find(p => p.id === pongGame.player1_id)?.name}
                          </p>
                          <div className="pong-buttons">
                            <button className="pong-btn" onMouseDown={(e) => { e.preventDefault(); movePaddle(1, 'up'); }}>
                              ▲
                            </button>
                            <button className="pong-btn" onMouseDown={(e) => { e.preventDefault(); movePaddle(1, 'down'); }}>
                              ▼
                            </button>
                          </div>
                        </div>
                        <div className="pong-control-section">
                          <p className="pong-control-label">
                            {participants.find(p => p.id === pongGame.player2_id)?.name}
                          </p>
                          <div className="pong-buttons">
                            <button className="pong-btn" onMouseDown={(e) => { e.preventDefault(); movePaddle(2, 'up'); }}>
                              ▲
                            </button>
                            <button className="pong-btn" onMouseDown={(e) => { e.preventDefault(); movePaddle(2, 'down'); }}>
                              ▼
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                    <button className="ghost small" onClick={endPongGame}>
                      Afslut spil
                    </button>
                  </>
                )}
              </div>
            )}
          </section>
        </div>
      </div>

      {showInviteModal && (
        <div className="modal-overlay" onClick={() => setShowInviteModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Inviter makkere</h2>
              <button
                className="modal-close"
                type="button"
                onClick={() => setShowInviteModal(false)}
                aria-label="Luk"
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p>Scan QR-koden for at deltage i crawlen:</p>
              <div className="qr-container">
                <QRCodeSVG
                  value="https://julecrawl.bolt.host"
                  size={256}
                  level="H"
                  includeMargin={true}
                />
              </div>
              <p className="muted small">https://julecrawl.bolt.host</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
