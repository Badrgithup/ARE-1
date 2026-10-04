/** Named constants — no magic numbers */

export const UNDO_WINDOW_MS = 30_000

export const DEFAULT_BATCH_SIZE = 20

export const BATCH_SIZE_OPTIONS = [10, 15, 20, 25] as const

export const ANIMATION_DURATION = {
  WINNER_CELEBRATION: 1500,
  UNDO_SLIDE_IN: 300,
  ROUND_TRANSITION: 2000,
  FINAL_MATCH_SETUP: 2000,
  TOURNAMENT_WINNER: 3000,
  MATCH_CARD_LOAD: 800,
} as const

export const STAGGER_DELAY_MS = 100

export const DATA_DIR = 'data/tournaments'

/** Design tokens */
export const THEME = {
  bgPrimary: '#050505',
  bgSurface: '#0B0B0B',
  bgCard: '#141414',
  bgCardHover: '#1A1A1A',
  accentGold: '#F2B900',
  accentGoldDim: '#C49600',
  accentBlue: '#00A8FF',
  textPrimary: '#F5F5F5',
  textSecondary: '#B8B8B8',
  textMuted: '#666666',
  border: '#1E1E1E',
  danger: '#EF4444',
  success: '#22C55E',
} as const
