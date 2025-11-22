import { supabase } from './supabase'

export type Participant = {
  id: string
  name: string
  beers: number
  created_at: string
}

export type DrinkEntry = {
  id: string
  participant_id: string
  timestamp: string
}

export type RouteStop = {
  id: string
  order_index: number
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

export type Card = { rank: CardRank; suit: CardSuit }

export type CrawlState = {
  id: string
  timer_target: string | null
  timer_duration: number
  active_stop_id: string | null
  mood_score: number
  arrival_cooldown_until: string | null
  round_cooldown_until: string | null
  last_round_winner_id: string | null
  over_under_streak: number
  over_under_current_card: Card | null
  over_under_last_card: Card | null
  over_under_deck: Card[]
  over_under_message: string
  over_under_penalty: number | null
  over_under_active_player_id: string | null
  ace_mode: 'low' | 'high' | 'both'
  updated_at: string
}

export type BeerPongGame = {
  id: string
  player1_id: string
  player2_id: string
  player1_cups: number
  player2_cups: number
  current_turn: number
  status: 'active' | 'finished'
  winner_id: string | null
  created_at: string
  finished_at: string | null
}

export type PongGame = {
  id: string
  player1_id: string
  player2_id: string
  player1_score: number
  player2_score: number
  ball_x: number
  ball_y: number
  ball_dx: number
  ball_dy: number
  paddle1_y: number
  paddle2_y: number
  status: 'active' | 'finished'
  winner_id: string | null
  created_at: string
  finished_at: string | null
  last_update: string
}

const CRAWL_STATE_ID = '00000000-0000-0000-0000-000000000001'

export const db = {
  async getParticipants() {
    const { data, error } = await supabase
      .from('participants')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) throw error
    return data as Participant[]
  },

  async createParticipant(name: string) {
    const { data, error } = await supabase
      .from('participants')
      .insert({ name, beers: 0 })
      .select()
      .single()

    if (error) throw error
    return data as Participant
  },

  async updateParticipantBeers(participantId: string, beers: number) {
    const { error } = await supabase
      .from('participants')
      .update({ beers })
      .eq('id', participantId)

    if (error) throw error
  },

  async deleteParticipant(participantId: string) {
    const { error } = await supabase
      .from('participants')
      .delete()
      .eq('id', participantId)

    if (error) throw error
  },

  async getDrinkLog() {
    const { data, error } = await supabase
      .from('drink_log')
      .select('*')
      .order('timestamp', { ascending: true })

    if (error) throw error
    return data as DrinkEntry[]
  },

  async logDrink(participantId: string) {
    const { data, error } = await supabase
      .from('drink_log')
      .insert({ participant_id: participantId })
      .select()
      .single()

    if (error) throw error
    return data as DrinkEntry
  },

  async clearDrinkLog() {
    const { error } = await supabase
      .from('drink_log')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')

    if (error) throw error
  },

  async getRouteStops() {
    const { data, error } = await supabase
      .from('route_stops')
      .select('*')
      .order('order_index', { ascending: true })

    if (error) throw error
    return data as RouteStop[]
  },

  async updateRouteStop(stopId: string, updates: Partial<RouteStop>) {
    const { error } = await supabase
      .from('route_stops')
      .update(updates)
      .eq('id', stopId)

    if (error) throw error
  },

  async getCrawlState() {
    const { data, error } = await supabase
      .from('crawl_state')
      .select('*')
      .eq('id', CRAWL_STATE_ID)
      .maybeSingle()

    if (error) throw error

    if (!data) {
      const { data: newState, error: insertError } = await supabase
        .from('crawl_state')
        .insert({
          id: CRAWL_STATE_ID,
          mood_score: 0,
          over_under_message: 'Gæt over eller under for næste kort',
          over_under_streak: 0,
          over_under_deck: [],
        })
        .select()
        .single()

      if (insertError) throw insertError
      return newState as CrawlState
    }

    return data as CrawlState
  },

  async updateCrawlState(updates: Partial<CrawlState>) {
    const { error } = await supabase
      .from('crawl_state')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', CRAWL_STATE_ID)

    if (error) throw error
  },

  subscribeToParticipants(callback: (participants: Participant[]) => void) {
    const channel = supabase
      .channel('participants-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'participants' },
        async () => {
          const participants = await db.getParticipants()
          callback(participants)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  },

  subscribeToDrinkLog(callback: (drinks: DrinkEntry[]) => void) {
    const channel = supabase
      .channel('drink-log-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'drink_log' },
        async () => {
          const drinks = await db.getDrinkLog()
          callback(drinks)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  },

  subscribeToRouteStops(callback: (stops: RouteStop[]) => void) {
    const channel = supabase
      .channel('route-stops-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'route_stops' },
        async () => {
          const stops = await db.getRouteStops()
          callback(stops)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  },

  subscribeToCrawlState(callback: (state: CrawlState) => void) {
    const channel = supabase
      .channel('crawl-state-changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'crawl_state', filter: `id=eq.${CRAWL_STATE_ID}` },
        async () => {
          const state = await db.getCrawlState()
          callback(state)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  },

  async getBeerPongGames() {
    const { data, error } = await supabase
      .from('beer_pong_games')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    return data as BeerPongGame[]
  },

  async getActiveBeerPongGame() {
    const { data, error } = await supabase
      .from('beer_pong_games')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error
    return data as BeerPongGame | null
  },

  async createBeerPongGame(player1Id: string, player2Id: string) {
    const { data, error } = await supabase
      .from('beer_pong_games')
      .insert({
        player1_id: player1Id,
        player2_id: player2Id,
        player1_cups: 6,
        player2_cups: 6,
        current_turn: 1,
        status: 'active'
      })
      .select()
      .single()

    if (error) throw error
    return data as BeerPongGame
  },

  async updateBeerPongGame(gameId: string, updates: Partial<BeerPongGame>) {
    const { error } = await supabase
      .from('beer_pong_games')
      .update(updates)
      .eq('id', gameId)

    if (error) throw error
  },

  async finishBeerPongGame(gameId: string, winnerId: string) {
    const { error } = await supabase
      .from('beer_pong_games')
      .update({
        status: 'finished',
        winner_id: winnerId,
        finished_at: new Date().toISOString()
      })
      .eq('id', gameId)

    if (error) throw error
  },

  subscribeToBeerPongGames(callback: (games: BeerPongGame[]) => void) {
    const channel = supabase
      .channel('beer-pong-games-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'beer_pong_games' },
        async () => {
          const games = await db.getBeerPongGames()
          callback(games)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  },

  async getPongGames() {
    const { data, error } = await supabase
      .from('pong_games')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    return data as PongGame[]
  },

  async getActivePongGame() {
    const { data, error } = await supabase
      .from('pong_games')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error
    return data as PongGame | null
  },

  async createPongGame(player1Id: string, player2Id: string) {
    const { data, error } = await supabase
      .from('pong_games')
      .insert({
        player1_id: player1Id,
        player2_id: player2Id,
        player1_score: 0,
        player2_score: 0,
        ball_x: 50,
        ball_y: 50,
        ball_dx: 1.5,
        ball_dy: 1,
        paddle1_y: 50,
        paddle2_y: 50,
        status: 'active'
      })
      .select()
      .single()

    if (error) throw error
    return data as PongGame
  },

  async updatePongGame(gameId: string, updates: Partial<PongGame>) {
    const { error } = await supabase
      .from('pong_games')
      .update({ ...updates, last_update: new Date().toISOString() })
      .eq('id', gameId)

    if (error) throw error
  },

  async finishPongGame(gameId: string, winnerId: string) {
    const { error } = await supabase
      .from('pong_games')
      .update({
        status: 'finished',
        winner_id: winnerId,
        finished_at: new Date().toISOString()
      })
      .eq('id', gameId)

    if (error) throw error
  },

  subscribeToPongGames(callback: () => void) {
    const channel = supabase
      .channel('pong-games-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pong_games' },
        callback
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  },
}
