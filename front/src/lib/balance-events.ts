export const BALANCE_DELTA_EVENT = 'the-river:balance-delta';
export const BALANCE_FEEDBACK_EVENT = 'the-river:balance-feedback';

export type BalanceDeltaDetail = {
  delta: number;
  source?: string;
};

export function emitBalanceDelta(delta: number, source?: string) {
  if (typeof window === 'undefined') return;
  if (!Number.isFinite(delta) || delta === 0) return;

  const detail = { delta: Math.trunc(delta), source };
  window.dispatchEvent(new CustomEvent<BalanceDeltaDetail>(BALANCE_DELTA_EVENT, { detail }));
  window.dispatchEvent(new CustomEvent<BalanceDeltaDetail>(BALANCE_FEEDBACK_EVENT, { detail }));
}

export function emitBalanceFeedback(delta: number, source?: string) {
  if (typeof window === 'undefined') return;
  if (!Number.isFinite(delta) || delta === 0) return;

  window.dispatchEvent(new CustomEvent<BalanceDeltaDetail>(BALANCE_FEEDBACK_EVENT, {
    detail: { delta: Math.trunc(delta), source },
  }));
}
