'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import {
  ArrowRight,
  BookOpen,
  Bot,
  ChevronRight,
  CircleDollarSign,
  Copy,
  Crown,
  MessageCircle,
  PanelRightOpen,
  Play,
  Plus,
  RefreshCcw,
  Send,
  Sparkles,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { apiGet, apiPost } from '@/api/client';
import { RequireAuth } from '@/auth/require-auth';
import { useAuth } from '@/auth/auth-context';
import { EmptyState, StatusMessage } from '@/components/ui';
import type { Card, PokerTable } from '@/types/api';

type TableForm = {
  buyInAmount: number;
  smallBlindAmount: number;
  bigBlindAmount: number;
  maxPlayers: number;
  fillWithBots: boolean;
  visibility: 'PUBLIC' | 'PRIVATE';
};

type ChatMessage = {
  id: number;
  author: string;
  text: string;
  time: string;
};

type ChipValue = 1 | 5 | 10 | 25 | 50 | 100 | 500 | 1000 | 5000 | 10000;

type ChipBurst = {
  id: number;
  amount: number;
  side: 'left' | 'right';
};

type HandEvaluation = {
  label: string;
  detail: string;
  cardKeys: string[];
  strength: number;
};

type GameOverSummary = {
  tableId: string;
  winnerId: string;
  detail: string;
};

const handRank: Record<string, number> = {
  A: 14,
  K: 13,
  Q: 12,
  J: 11,
  T: 10,
  '10': 10,
  '9': 9,
  '8': 8,
  '7': 7,
  '6': 6,
  '5': 5,
  '4': 4,
  '3': 3,
  '2': 2,
};

const suitSymbols: Record<string, string> = {
  H: '♥',
  D: '♦',
  C: '♣',
  S: '♠',
};

const suitAssets: Record<string, string> = {
  H: 'hearts',
  D: 'diamonds',
  C: 'clubs',
  S: 'spades',
};

const bestHands = [
  ['Quinte flush royale', 'A K Q J 10 de la meme couleur'],
  ['Quinte flush', 'Cinq cartes qui se suivent, meme couleur'],
  ['Carre', 'Quatre cartes du meme rang'],
  ['Full', 'Un brelan plus une paire'],
  ['Couleur', 'Cinq cartes de la meme couleur'],
  ['Suite', 'Cinq cartes qui se suivent'],
  ['Brelan', 'Trois cartes du meme rang'],
  ['Deux paires', 'Deux paires distinctes'],
  ['Paire', 'Deux cartes du meme rang'],
  ['Carte haute', 'La meilleure carte disponible'],
];

function tableIdOf(table: PokerTable) {
  return table.id ?? table.tableId ?? table.name ?? '';
}

function cardKey(card: Card, index = 0) {
  return `${card.rank}-${card.suit}-${index}`;
}

function rankValue(card: Card) {
  return handRank[String(card.rank).toUpperCase()] ?? Number(card.rank) ?? 0;
}

function formatCard(card: Card) {
  const rank = String(card.rank).toUpperCase();
  return `${rank}${suitSymbols[card.suit] ?? card.suit}`;
}

function cardAsset(card?: Card) {
  if (!card) return '/assets/cards/card-back.svg';
  const suit = suitAssets[card.suit] ?? String(card.suit).toLowerCase();
  const rank = String(card.rank).toUpperCase() === 'T' ? '10' : String(card.rank).toUpperCase();
  return `/assets/cards/${suit}_${rank}.png`;
}

const chipValues: ChipValue[] = [10000, 5000, 1000, 500, 100, 50, 25, 10, 5, 1];

function chipAsset(value: ChipValue) {
  return `/assets/jetons/jeton%20${value}.png`;
}

function chipBreakdown(amount: number, maxChips = 7): ChipValue[] {
  let remaining = Math.max(0, Math.floor(amount));
  const chips: ChipValue[] = [];

  for (const value of chipValues) {
    while (remaining >= value && chips.length < maxChips) {
      chips.push(value);
      remaining -= value;
    }
  }

  if (!chips.length && amount > 0) chips.push(1);
  return chips;
}

function ChipStack({ amount, compact = false }: { amount: number; compact?: boolean }) {
  const chips = chipBreakdown(amount, compact ? 3 : 7);
  if (!chips.length) return null;

  return (
    <span className={compact ? 'chip-stack-visual compact' : 'chip-stack-visual'}>
      {chips.map((value, index) => (
        <Image src={chipAsset(value)} alt="" width={120} height={120} key={`${value}-${index}`} />
      ))}
    </span>
  );
}

function evaluateBestHand(cards: Card[]): HandEvaluation {
  if (!cards.length) {
    return { label: 'En attente des cartes', detail: 'Lance la main pour reveler ton potentiel.', cardKeys: [], strength: 0 };
  }

  const indexed = cards.map((card, index) => ({ card, index, value: rankValue(card), key: cardKey(card, index) }));
  const byValue = new Map<number, typeof indexed>();
  const bySuit = new Map<string, typeof indexed>();

  for (const item of indexed) {
    byValue.set(item.value, [...(byValue.get(item.value) ?? []), item]);
    bySuit.set(item.card.suit, [...(bySuit.get(item.card.suit) ?? []), item]);
  }

  const groups = [...byValue.entries()]
    .map(([value, list]) => ({ value, list }))
    .sort((a, b) => b.list.length - a.list.length || b.value - a.value);

  const findStraight = (pool: typeof indexed) => {
    const unique = [...new Map(pool.map((item) => [item.value, item])).values()].sort((a, b) => b.value - a.value);
    const wheelAce = unique.find((item) => item.value === 14);
    const sequence = wheelAce ? [...unique, { ...wheelAce, value: 1 }] : unique;

    for (let start = 0; start <= sequence.length - 5; start += 1) {
      const run = [sequence[start]];
      for (let cursor = start + 1; cursor < sequence.length && run.length < 5; cursor += 1) {
        const previous = run[run.length - 1];
        if (previous.value - sequence[cursor].value === 1) run.push(sequence[cursor]);
        if (previous.value !== sequence[cursor].value && previous.value - sequence[cursor].value > 1) break;
      }
      if (run.length === 5) return run.map((item) => item.key);
    }
    return [];
  };

  const flush = [...bySuit.values()].find((list) => list.length >= 5)?.sort((a, b) => b.value - a.value) ?? [];
  const straightFlush = flush.length >= 5 ? findStraight(flush) : [];

  if (straightFlush.length) {
    const royal = straightFlush.some((key) => key.startsWith('A-'));
    return {
      label: royal ? 'Quinte flush royale' : 'Quinte flush',
      detail: royal ? 'La main maximale est deja visible.' : 'Cinq cartes suivies de la meme couleur.',
      cardKeys: straightFlush,
      strength: royal ? 10 : 9,
    };
  }

  const four = groups.find((group) => group.list.length === 4);
  if (four) {
    return {
      label: 'Carre',
      detail: `Quatre ${formatCard(four.list[0].card).slice(0, -1)} verrouillent la main.`,
      cardKeys: four.list.map((item) => item.key),
      strength: 8,
    };
  }

  const triple = groups.find((group) => group.list.length === 3);
  const pairForFull = groups.find((group) => group.value !== triple?.value && group.list.length >= 2);
  if (triple && pairForFull) {
    return {
      label: 'Full',
      detail: 'Brelan plus paire, tres solide au showdown.',
      cardKeys: [...triple.list.slice(0, 3), ...pairForFull.list.slice(0, 2)].map((item) => item.key),
      strength: 7,
    };
  }

  if (flush.length >= 5) {
    return {
      label: 'Couleur',
      detail: `Cinq cartes ${suitSymbols[flush[0].card.suit] ?? flush[0].card.suit}.`,
      cardKeys: flush.slice(0, 5).map((item) => item.key),
      strength: 6,
    };
  }

  const straight = findStraight(indexed);
  if (straight.length) {
    return {
      label: 'Suite',
      detail: 'Cinq cartes connectees, attention aux couleurs adverses.',
      cardKeys: straight,
      strength: 5,
    };
  }

  if (triple) {
    return {
      label: 'Brelan',
      detail: `Trois ${formatCard(triple.list[0].card).slice(0, -1)} dans la combinaison.`,
      cardKeys: triple.list.map((item) => item.key),
      strength: 4,
    };
  }

  const pairs = groups.filter((group) => group.list.length === 2);
  if (pairs.length >= 2) {
    return {
      label: 'Deux paires',
      detail: 'Deux paires actives, bonne pression possible.',
      cardKeys: pairs.slice(0, 2).flatMap((group) => group.list.map((item) => item.key)),
      strength: 3,
    };
  }

  if (pairs.length === 1) {
    return {
      label: 'Paire',
      detail: `Paire de ${formatCard(pairs[0].list[0].card).slice(0, -1)}.`,
      cardKeys: pairs[0].list.map((item) => item.key),
      strength: 2,
    };
  }

  const high = indexed.sort((a, b) => b.value - a.value)[0];
  return {
    label: 'Carte haute',
    detail: `${formatCard(high.card)} joue pour l'instant.`,
    cardKeys: [high.key],
    strength: 1,
  };
}

function PokerCard({ card, highlighted = false, hidden = false, delay = 0 }: { card?: Card; highlighted?: boolean; hidden?: boolean; delay?: number }) {
  if (hidden || !card) {
    return (
      <span className="poker-card poker-card-back" style={{ '--deal-delay': `${delay}ms` } as React.CSSProperties}>
        <Image src="/assets/cards/card-back.svg" alt="Carte cachee" width={190} height={266} />
      </span>
    );
  }

  const red = card.suit === 'H' || card.suit === 'D';
  return (
    <span
      className={`poker-card ${red ? 'red' : ''} ${highlighted ? 'highlighted' : ''}`}
      style={{ '--deal-delay': `${delay}ms` } as React.CSSProperties}
      aria-label={formatCard(card)}
    >
      <Image src={cardAsset(card)} alt={formatCard(card)} width={190} height={266} />
    </span>
  );
}

function PokerContent() {
  const { user, refreshUser } = useAuth();
  const [tables, setTables] = useState<PokerTable[]>([]);
  const [myTables, setMyTables] = useState<PokerTable[]>([]);
  const [active, setActive] = useState<PokerTable | null>(null);
  const [hand, setHand] = useState<Card[]>([]);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [rulesOpen, setRulesOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState('');
  const [betAmount, setBetAmount] = useState(20);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chipBurst, setChipBurst] = useState<ChipBurst | null>(null);
  const [gameOver, setGameOver] = useState<GameOverSummary | null>(null);
  const [form, setForm] = useState<TableForm>({
    buyInAmount: 100,
    smallBlindAmount: 5,
    bigBlindAmount: 10,
    maxPlayers: 6,
    fillWithBots: true,
    visibility: 'PUBLIC',
  });
  const chipBurstTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gameOverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeId = active ? tableIdOf(active) : '';
  const communityCards = active?.communityCards ?? [];
  const displayCommunityCards: Array<Card | undefined> = communityCards.length ? communityCards : Array.from({ length: 5 }, () => undefined);
  const displayHandCards: Array<Card | undefined> = hand.length ? hand : Array.from({ length: 2 }, () => undefined);
  const allVisibleCards = useMemo(() => [...hand, ...communityCards], [hand, communityCards]);
  const bestHand = useMemo(() => evaluateBestHand(allVisibleCards), [allVisibleCards]);
  const highlightedCards = new Set(bestHand.cardKeys);
  const isShowdown = String(active?.phase ?? '').toUpperCase() === 'SHOWDOWN';
  const canAct = active?.status === 'IN_GAME' && !isShowdown;
  const canStart = active?.status !== 'IN_GAME';
  const currentUsername = user?.username ?? '';
  const playerStack = currentUsername ? Number(active?.stacks?.[currentUsername] ?? form.buyInAmount) : form.buyInAmount;
  const playerBet = currentUsername ? Number(active?.bets?.[currentUsername] ?? 0) : 0;
  const tableCurrentBet = Number(active?.currentBet ?? 0);
  const toCall = Math.max(0, tableCurrentBet - playerBet);
  const maxBetAmount = Math.max(1, toCall > 0 ? playerStack - toCall : playerStack);
  const clampedBetAmount = Math.min(Math.max(1, Math.floor(Number(betAmount) || 1)), maxBetAmount);
  const betActionLabel = toCall > 0 ? 'Relancer' : 'Miser';

  async function loadTables() {
    setError('');
    try {
      const [nextTables, nextMyTables] = await Promise.all([
        apiGet<PokerTable[]>('/tables/public', false),
        apiGet<PokerTable[]>('/tables/mine'),
      ]);
      setTables(nextTables);
      setMyTables(nextMyTables);
      if (activeId) await loadTable(activeId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tables poker indisponibles');
    }
  }

  async function loadTable(id: string) {
    const table = await apiGet<PokerTable>(`/tables/${id}`, false);
    setActive(table);
    try {
      setHand(await apiGet<Card[]>(`/tables/${id}/hand`));
    } catch {
      setHand([]);
    }
  }

  useEffect(() => {
    void loadTables();
  }, []);

  useEffect(() => {
    if (!user?.username || activeId || typeof window === 'undefined') return;

    const savedTableId = window.localStorage.getItem('the-river-active-poker-table');
    if (!savedTableId) return;

    let cancelled = false;
    void (async () => {
      try {
        const table = await apiGet<PokerTable>(`/tables/${savedTableId}`, false);
        if (cancelled || !table.players?.includes(user.username)) return;
        setActive(table);
        await loadTable(savedTableId);
      } catch {
        window.localStorage.removeItem('the-river-active-poker-table');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeId, user?.username]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (activeId) {
      window.localStorage.setItem('the-river-active-poker-table', activeId);
    } else {
      window.localStorage.removeItem('the-river-active-poker-table');
    }
  }, [activeId]);

  useEffect(() => {
    if (!activeId) return;

    let cancelled = false;
    const intervalMs = isShowdown ? 800 : 2400;
    const interval = window.setInterval(async () => {
      try {
        const table = await apiGet<PokerTable>(`/tables/${activeId}`, false);
        if (cancelled) return;
        setActive(table);
        try {
          const nextHand = await apiGet<Card[]>(`/tables/${activeId}/hand`);
          if (!cancelled) setHand(nextHand);
        } catch {
          if (!cancelled) setHand([]);
        }
      } catch {
        // polling silencieux: les actions affichent deja les erreurs utiles
      }
    }, intervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeId, isShowdown]);

  useEffect(() => {
    setBetAmount((previous) => Math.min(Math.max(1, Math.floor(Number(previous) || 1)), maxBetAmount));
  }, [maxBetAmount]);

  useEffect(() => {
    const finished = String(active?.status ?? '').toUpperCase() === 'FINISHED';
    if (!active || !finished || !active.lastWinnerId) return;

    const finishedTableId = tableIdOf(active);
    if (gameOver?.tableId === finishedTableId) return;

    setGameOver({
      tableId: finishedTableId,
      winnerId: active.lastWinnerId,
      detail: active.lastWinnerHandDescription ?? 'Partie terminee',
    });

    if (gameOverTimer.current) clearTimeout(gameOverTimer.current);
    gameOverTimer.current = setTimeout(async () => {
      setActive(null);
      setHand([]);
      setMessages([]);
      setChipBurst(null);
      setGameOver(null);
      if (typeof window !== 'undefined') window.localStorage.removeItem('the-river-active-poker-table');
      try {
        await refreshUser();
        const [nextTables, nextMyTables] = await Promise.all([
          apiGet<PokerTable[]>('/tables/public', false),
          apiGet<PokerTable[]>('/tables/mine'),
        ]);
        setTables(nextTables);
        setMyTables(nextMyTables);
      } catch {}
    }, 4200);
  }, [active, gameOver?.tableId, refreshUser]);

  useEffect(() => {
    return () => {
      if (gameOverTimer.current) clearTimeout(gameOverTimer.current);
    };
  }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      const out = await apiPost<{ tableId: string; table: PokerTable }>('/tables/create', {
        ...form,
      });
      await refreshUser();
      setActive(out.table);
      await loadTable(out.tableId || tableIdOf(out.table));
      await loadTables();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Creation impossible');
    }
  }

  async function join(id: string) {
    setError('');
    try {
      const table = await apiPost<PokerTable>('/tables/join-public', { tableId: id });
      await refreshUser();
      setActive(table);
      await loadTable(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de rejoindre');
    }
  }

  async function resumeTable(id: string) {
    setError('');
    try {
      await loadTable(id);
      pushSystemMessage(`Retour sur la table ${id}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de reprendre la table');
    }
  }

  async function joinPrivate(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      const table = await apiPost<PokerTable>('/tables/join', { code });
      const id = tableIdOf(table);
      setActive(table);
      await loadTable(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Code invalide');
    }
  }

  async function action(actionName: string, amount?: number) {
    if (!activeId) return;
    setError('');
    const visualAmount = actionVisualAmount(actionName, amount);
    try {
      const table = await apiPost<PokerTable>(`/tables/${activeId}/action`, { action: actionName, amount });
      setActive(table);
      await loadTable(activeId);
      await refreshUser();
      pushSystemMessage(`${user?.username ?? 'Joueur'} ${actionName.toLowerCase()}${amount != null ? ` ${amount} credits` : ''}`);
      triggerChipBurst(visualAmount);
      if (table.lastWinnerId) {
        pushSystemMessage(`${table.lastWinnerId} remporte la main avec ${table.lastWinnerHandDescription ?? 'la meilleure main'}.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action impossible');
    }
  }

  async function submitBet() {
    const amount = clampedBetAmount;
    await action(toCall > 0 ? 'RAISE' : 'BET', amount);
  }

  async function start() {
    if (!activeId) return;
    setError('');
    try {
      const table = await apiPost<PokerTable>(`/tables/${activeId}/start`, {});
      setActive(table);
      await loadTable(activeId);
      pushSystemMessage(`Nouvelle main sur ${activeId}. Blinds ${table.smallBlindAmount}/${table.bigBlindAmount}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demarrage impossible');
    }
  }

  async function leaveActiveTable() {
    if (!activeId) {
      setActive(null);
      return;
    }

    setError('');
    try {
      await apiPost<{ tableDeleted: boolean; table: PokerTable | null }>(`/tables/${activeId}/leave`, {});
      setActive(null);
      setHand([]);
      setMessages([]);
      setChipBurst(null);
      if (typeof window !== 'undefined') window.localStorage.removeItem('the-river-active-poker-table');
      await refreshUser();
      setTables(await apiGet<PokerTable[]>('/tables/public', false));
      setMyTables(await apiGet<PokerTable[]>('/tables/mine'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de quitter la table');
    }
  }

  function pushSystemMessage(text: string) {
    setMessages((previous) => [
      ...previous,
      {
        id: Date.now() + previous.length,
        author: 'Systeme',
        text,
        time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  }

  function actionVisualAmount(actionName: string, amount?: number) {
    if (!active || !user?.username) return Number(amount ?? 0);
    const myBet = Number(active.bets?.[user.username] ?? 0);
    const currentBet = Number(active.currentBet ?? 0);
    const stack = Number(active.stacks?.[user.username] ?? 0);

    if (actionName === 'CALL') return Math.max(0, currentBet - myBet);
    if (actionName === 'ALL_IN') return stack;
    if (actionName === 'RAISE') return Math.min(stack, Math.max(0, currentBet + Number(amount ?? 0) - myBet));
    if (actionName === 'BET') return Number(amount ?? 0);
    return 0;
  }

  function triggerChipBurst(amount: number) {
    if (amount <= 0) return;
    if (chipBurstTimer.current) clearTimeout(chipBurstTimer.current);
    setChipBurst({ id: Date.now(), amount, side: Math.random() > 0.5 ? 'left' : 'right' });
    chipBurstTimer.current = setTimeout(() => setChipBurst(null), 1500);
  }

  function sendMessage(event: FormEvent) {
    event.preventDefault();
    const text = chatDraft.trim();
    if (!text) return;
    setMessages((previous) => [
      ...previous,
      { id: Date.now(), author: user?.username ?? 'Moi', text, time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) },
    ]);
    setChatDraft('');
  }

  async function copyCode() {
    if (!activeId || typeof navigator === 'undefined') return;

    try {
      await navigator.clipboard?.writeText(activeId);
      pushSystemMessage(`Code ${activeId} copie.`);
      return;
    } catch {
      if (typeof document === 'undefined') return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = activeId;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    pushSystemMessage(`Code ${activeId} copie.`);
  }

  const seats = useMemo(() => {
    const players = active?.players ?? [];
    const filled = players.length ? players : [user?.username ?? 'Toi', 'Maya', 'Noah', 'Iris'];
    return filled.slice(0, Math.max(4, Math.min(form.maxPlayers, 6))).map((name, index) => ({
      name,
      stack: active?.stacks?.[name] ?? (index === 0 ? user?.credits ?? 0 : 1000 - index * 75),
      bet: active?.bets?.[name] ?? (index % 2 === 0 ? 0 : form.bigBlindAmount),
      isHero: name === user?.username || index === 0,
      isDealer: active?.dealerPlayerId ? name === active.dealerPlayerId : index === (active?.dealerIndex ?? 1),
    }));
  }, [active, form.bigBlindAmount, form.maxPlayers, user?.credits, user?.username]);

  if (!active) {
    return (
      <section className="poker-page">
        <header className="poker-lobby-hero">
          <div className="poker-lobby-copy">
            <span className="welcome-pill">
              <Sparkles size={15} /> Poker room
            </span>
            <h1>Choisis ta table.</h1>
            <p>Creer une partie, rejoindre un code prive ou prendre une place sur une table publique.</p>
            <div className="poker-lobby-stats">
              <span><Users size={17} /> {tables.length} tables</span>
              <span><CircleDollarSign size={17} /> {user?.credits ?? 0} credits</span>
              <span><Bot size={17} /> Bots optionnels</span>
            </div>
          </div>
          <div className="poker-preview-table" aria-hidden="true">
            <Image className="poker-lobby-art" src="/assets/home/game-poker.png" alt="" width={720} height={520} priority />
            <div className="preview-felt">
              <div className="preview-pot">POT</div>
              <Image className="preview-card one" src="/assets/cards/spades_A.png" alt="" width={190} height={266} />
              <Image className="preview-card two" src="/assets/cards/hearts_K.png" alt="" width={190} height={266} />
              <Image className="preview-card three" src="/assets/cards/clubs_Q.png" alt="" width={190} height={266} />
              <Image className="preview-chip blue" src={chipAsset(25)} alt="" width={240} height={240} />
              <Image className="preview-chip gold" src={chipAsset(100)} alt="" width={240} height={240} />
              <Image className="preview-chip red" src={chipAsset(10)} alt="" width={240} height={240} />
            </div>
          </div>
        </header>

        {error ? <StatusMessage type="error">{error}</StatusMessage> : null}

        <div className="poker-lobby-grid">
          <section className="poker-lobby-panel">
            <div className="poker-panel-heading">
              <div>
                <h2>Nouvelle table</h2>
                <p>Parametres de depart</p>
              </div>
            </div>
            <form className="poker-create-form" onSubmit={create}>
              {[
                ['Buy-in', 'buyInAmount', 25, 2000],
                ['Small blind', 'smallBlindAmount', 1, 100],
                ['Big blind', 'bigBlindAmount', 2, 200],
                ['Joueurs max', 'maxPlayers', 2, 8],
              ].map(([label, key, min, max]) => (
                <label className="field" key={key}>
                  <span>{label}</span>
                  <input
                    type="number"
                    min={min}
                    max={max}
                    value={form[key as keyof TableForm] as number}
                    onChange={(event) => setForm((previous) => ({ ...previous, [key]: Number(event.target.value) }))}
                  />
                </label>
              ))}
              <label className="poker-toggle">
                <input
                  type="checkbox"
                  checked={form.fillWithBots}
                  onChange={(event) => setForm((previous) => ({ ...previous, fillWithBots: event.target.checked }))}
                />
                <span><Bot size={18} /> Completer avec des bots</span>
              </label>
              <div className="poker-visibility-control">
                <span>Visibilite</span>
                <div className="segmented-control full">
                  <button
                    className={form.visibility === 'PUBLIC' ? 'active' : ''}
                    onClick={() => setForm((previous) => ({ ...previous, visibility: 'PUBLIC' }))}
                    type="button"
                  >
                    Publique
                  </button>
                  <button
                    className={form.visibility === 'PRIVATE' ? 'active' : ''}
                    onClick={() => setForm((previous) => ({ ...previous, visibility: 'PRIVATE' }))}
                    type="button"
                  >
                    Privee
                  </button>
                </div>
              </div>
              <button className="button" type="submit">
                <Plus size={18} /> Creer la table
              </button>
            </form>
          </section>

          <section className="poker-lobby-panel">
            <div className="poker-panel-heading">
              <div>
                <h2>Code prive</h2>
                <p>Rejoins directement une table</p>
              </div>
              <ChevronRight size={20} />
            </div>
            <form className="poker-code-form" onSubmit={joinPrivate}>
              <label className="field">
                <span>Code table</span>
                <input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} maxLength={10} placeholder="RIVER7" />
              </label>
              <button className="button secondary" type="submit">
                Rejoindre <ArrowRight size={18} />
              </button>
            </form>
          </section>

          {myTables.length ? (
            <section className="poker-lobby-panel poker-resume-panel">
              <div className="poker-panel-heading">
                <div>
                  <h2>Reprendre une table</h2>
                  <p>Tu es encore assis a ces parties</p>
                </div>
                <button className="icon-button" onClick={() => void loadTables()} type="button" aria-label="Actualiser mes tables">
                  <RefreshCcw size={18} />
                </button>
              </div>
              <div className="poker-table-list">
                {myTables.map((table) => {
                  const id = tableIdOf(table);
                  return (
                    <article className="poker-public-table resume" key={id}>
                      <div>
                        <strong>{id}</strong>
                        <span>{table.status ?? 'En attente'} · {table.phase ?? 'Lobby'} · {table.players?.length ?? 0} joueurs</span>
                      </div>
                      <button className="button small" onClick={() => void resumeTable(id)} type="button">
                        Reprendre
                      </button>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section className="poker-lobby-panel poker-public-panel">
            <div className="poker-panel-heading">
              <div>
                <h2>Tables publiques</h2>
                <p>Places disponibles</p>
              </div>
              <button className="icon-button" onClick={() => void loadTables()} type="button" aria-label="Actualiser">
                <RefreshCcw size={18} />
              </button>
            </div>
            <div className="poker-table-list">
              {tables.length ? (
                tables.map((table) => {
                  const id = tableIdOf(table);
                  return (
                    <article className="poker-public-table" key={id}>
                      <div>
                        <strong>{id}</strong>
                        <span>{table.players?.length ?? 0} joueurs · {table.status ?? 'ouverte'}</span>
                      </div>
                      <button className="button secondary small" onClick={() => void join(id)} type="button">
                        Entrer
                      </button>
                    </article>
                  );
                })
              ) : (
                <EmptyState title="Aucune table publique" text="Cree la premiere table ouverte." />
              )}
            </div>
          </section>
        </div>
      </section>
    );
  }

  return (
    <section className={`poker-game-shell ${chatOpen ? 'chat-open' : ''}`}>
      <header className="poker-game-header">
        <div>
          <span className="welcome-pill">
            <Trophy size={15} /> Table active
          </span>
          <h1>{activeId || 'Poker table'}</h1>
          <p>{active.status ?? 'En attente'} · {active.phase ?? 'Lobby'} · {seats.length} joueurs</p>
        </div>
        <div className="poker-game-actions">
          <button className="button secondary" onClick={() => void loadTable(activeId)} type="button">
            <RefreshCcw size={17} /> Sync
          </button>
          <button className="button secondary" onClick={() => setRulesOpen(true)} type="button">
            <BookOpen size={17} /> Regles
          </button>
          <button className="button secondary" onClick={() => setChatOpen((open) => !open)} type="button">
            {chatOpen ? <X size={17} /> : <MessageCircle size={17} />} Chat
          </button>
          <button className="icon-button" onClick={() => void leaveActiveTable()} type="button" aria-label="Quitter la table">
            <PanelRightOpen size={18} />
          </button>
        </div>
      </header>

      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}

      <div className="table-chat-mobile">
        {messages.length > 0 ? (
          <button className="table-chat-peek" onClick={() => setChatOpen(true)} type="button">
            {messages.slice(-5).map((message) => (
              <span key={message.id}>
                <strong>{message.author}</strong> {message.text}
              </span>
            ))}
          </button>
        ) : null}
        <form className="table-chat-dock" onSubmit={sendMessage}>
          <input
            value={chatDraft}
            onChange={(event) => setChatDraft(event.target.value)}
            onFocus={() => setChatOpen(true)}
            placeholder="Chat..."
          />
          <button className="icon-button" type="submit" aria-label="Envoyer">
            <Send size={18} />
          </button>
        </form>
      </div>

      <div className="poker-game-layout">
        <main className="poker-table-zone">
          <section className="poker-felt-table">
            <div className="table-rail" />
            <div className="table-glow" />
            <div className="poker-pot">
              <span>Pot</span>
              <strong>{active.pot ?? 0} credits</strong>
              <button className="copy-table-code" onClick={copyCode} type="button">
                <Copy size={14} /> Code
              </button>
            </div>

            <div className="poker-deck">
              <Image src="/assets/cards/card-back.svg" alt="Paquet" width={190} height={266} />
              <Image src="/assets/cards/card-back.svg" alt="" width={190} height={266} />
              <Image src="/assets/cards/card-back.svg" alt="" width={190} height={266} />
            </div>

            {chipBurst ? (
              <div className={`chip-splash ${chipBurst.side}`} key={chipBurst.id}>
                <ChipStack amount={chipBurst.amount} />
              </div>
            ) : null}

            <div className="community-zone">
              {displayCommunityCards.map((card, index) =>
                card ? (
                  <PokerCard
                    card={card}
                    delay={index * 80}
                    highlighted={highlightedCards.has(cardKey(card, hand.length + index))}
                    key={cardKey(card, index)}
                  />
                ) : (
                  <span className="poker-card-slot" key={`slot-${index}`} />
                ),
              )}
            </div>

            {seats.map((seat, index) => (
              <article className={`poker-seat seat-${index + 1} ${seat.isHero ? 'hero-seat' : ''}`} key={`${seat.name}-${index}`}>
                <div className="seat-avatar">{seat.isDealer ? <Crown size={16} /> : seat.name.slice(0, 1).toUpperCase()}</div>
                <div>
                  <strong>{seat.name}</strong>
                  <span>{seat.stack} credits</span>
                </div>
                {seat.isDealer ? <span className="dealer-seat-tag">Dealer</span> : null}
              </article>
            ))}
            {isShowdown ? <div className="showdown-shield">Nouvelle main en preparation...</div> : null}
          </section>

          <section className="hero-hand-panel">
            <div className="best-hand-callout">
              <span>Main actuelle</span>
              <strong>{bestHand.label}</strong>
              <p>{bestHand.detail}</p>
            </div>
            <div className="hero-cards">
              {displayHandCards.map((card, index) => (
                <PokerCard
                  card={card}
                  delay={index * 120}
                  highlighted={card ? highlightedCards.has(cardKey(card, index)) : false}
                  hidden={!card}
                  key={card ? cardKey(card, index) : `hero-${index}`}
                />
              ))}
            </div>
          </section>

          <section className="poker-control-panel">
            <div className="poker-action-group">
              <button className="button" disabled={!canStart} onClick={() => void start()} type="button">
                <Play size={18} /> Start
              </button>
              <button className="button secondary" disabled={!canAct} onClick={() => void action('CHECK')} type="button">
                Check
              </button>
              <button className="button secondary" disabled={!canAct} onClick={() => void action('CALL')} type="button">
                Call {active.currentBet ? `${active.currentBet}` : ''}
              </button>
              <button className="button danger" disabled={!canAct} onClick={() => void action('FOLD')} type="button">
                Fold
              </button>
              <button className="button all-in" disabled={!canAct} onClick={() => void action('ALL_IN')} type="button">
                All in
              </button>
            </div>
            <div className="bet-control">
              <label>
                <span>Mise</span>
                <strong>{clampedBetAmount} credits</strong>
              </label>
              <input
                aria-label="Montant exact de la mise"
                className="bet-amount-input"
                min={1}
                max={maxBetAmount}
                type="number"
                value={betAmount}
                onChange={(event) => setBetAmount(Number(event.target.value))}
              />
              <button className="button secondary" disabled={!canAct} onClick={() => void submitBet()} type="button">
                {betActionLabel}
              </button>
            </div>
          </section>

          {active.lastWinnerId ? (
            <StatusMessage type="success">
              {active.lastWinnerId} remporte la main · {active.lastWinnerHandDescription}
            </StatusMessage>
          ) : null}
        </main>

        <aside className="poker-chat-panel">
          <div className="poker-panel-heading">
            <div>
              <h2>Chat</h2>
              <p>{messages.length} messages</p>
            </div>
            <button className="icon-button" onClick={() => setChatOpen(false)} type="button" aria-label="Fermer le chat">
              <X size={18} />
            </button>
          </div>
          <div className="chat-feed">
            {messages.map((message) => (
              <article className={message.author === user?.username ? 'own' : ''} key={message.id}>
                <span>{message.author} · {message.time}</span>
                <p>{message.text}</p>
              </article>
            ))}
          </div>
          <form className="chat-form" onSubmit={sendMessage}>
            <input value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} placeholder="Message..." />
            <button className="icon-button" type="submit" aria-label="Envoyer">
              <Send size={18} />
            </button>
          </form>
        </aside>
      </div>

      {rulesOpen ? (
        <>
          <button className="drawer-backdrop poker-rules-backdrop" onClick={() => setRulesOpen(false)} type="button" aria-label="Fermer les regles" />
          <aside className="poker-rules-drawer open">
            <div className="poker-panel-heading">
              <div>
                <h2>Meilleures mains</h2>
                <p>Du plus fort au plus faible</p>
              </div>
              <button className="icon-button" onClick={() => setRulesOpen(false)} type="button" aria-label="Fermer">
                <X size={18} />
              </button>
            </div>
            <div className="rules-list">
              {bestHands.map(([title, text], index) => (
                <article className={bestHand.label === title ? 'active' : ''} key={title}>
                  <span>{index + 1}</span>
                  <div>
                    <strong>{title}</strong>
                    <p>{text}</p>
                  </div>
                </article>
              ))}
            </div>
          </aside>
        </>
      ) : null}

      {gameOver ? (
        <div className="poker-game-over-layer" role="dialog" aria-modal="true" aria-labelledby="game-over-title">
          <div className="poker-game-over-card">
            <span className="welcome-pill">
              <Trophy size={15} /> Partie terminee
            </span>
            <h2 id="game-over-title">{gameOver.winnerId} remporte la partie</h2>
            <p>{gameOver.detail}</p>
            <div className="game-over-countdown">Retour au lobby dans quelques secondes...</div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default function PokerPage() {
  return (
    <RequireAuth>
      <PokerContent />
    </RequireAuth>
  );
}
