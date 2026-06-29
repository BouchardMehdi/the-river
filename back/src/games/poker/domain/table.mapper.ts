import type { PokerTableInternal, PokerTablePublic } from './table.types';

export function toPublic(table: PokerTableInternal): PokerTablePublic {
  const handSizes: Record<string, number> = {};
  for (const pid of table.players ?? []) {
    handSizes[pid] = table.hands?.[pid]?.length ?? 0;
  }

  const foldedPlayers = Object.entries(table.foldedPlayers ?? {})
    .filter(([, v]) => v)
    .map(([k]) => k);

  const bustedPlayers = Object.entries(table.bustedPlayers ?? {})
    .filter(([, v]) => v)
    .map(([k]) => k);

  return {
    id: table.id,
    name: table.name,
    maxPlayers: table.maxPlayers,

    buyInAmount: table.buyInAmount,
    smallBlindAmount: table.smallBlindAmount,
    bigBlindAmount: table.bigBlindAmount,

    status: table.status,
    createdAt: table.createdAt,

    players: table.players ?? [],

    ownerPlayerId: table.ownerPlayerId,
    startedAt: table.startedAt,

    phase: table.phase ?? 'WAITING',

    deckRemaining: table.deck?.length ?? 0,

    handSizes,
    communityCards: (table.communityCards ?? []) as any,
    communityCount: table.communityCards?.length ?? 0,

    stacks: table.stacks ?? {},

    pot: table.pot ?? 0,
    currentBet: table.currentBet ?? 0,
    currentPlayerId: (table as any).currentPlayerId,
    bets: table.bets ?? {},
    foldedPlayers,

    dealerIndex: table.dealerIndex ?? 0,
    dealerPlayerId: table.dealerPlayerId,
    smallBlindPlayerId: table.smallBlindPlayerId,
    bigBlindPlayerId: table.bigBlindPlayerId,

    bustedPlayers,

    lastWinnerId: table.lastWinnerId,
    lastWinnerHand: (table.lastWinnerHand ?? undefined) as any,
    lastWinnerHandDescription: table.lastWinnerHandDescription,

    lastWinners: (table.lastWinners ?? undefined) as any,
  };
}
