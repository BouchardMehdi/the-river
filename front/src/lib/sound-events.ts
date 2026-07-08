'use client';

export type GameSound =
  | 'button'
  | 'toggle'
  | 'open'
  | 'close'
  | 'chip'
  | 'card'
  | 'deal'
  | 'spin'
  | 'reel-stop'
  | 'roulette'
  | 'drop'
  | 'dice'
  | 'cashout'
  | 'win'
  | 'loss'
  | 'jackpot'
  | 'crash'
  | 'notification';

export const GAME_SOUND_EVENT = 'the-river-game-sound';

export function emitGameSound(sound: GameSound) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<{ sound: GameSound }>(GAME_SOUND_EVENT, { detail: { sound } }));
}
