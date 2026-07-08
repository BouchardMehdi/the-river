'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { io, type Socket } from 'socket.io-client';
import {
  ArrowRight,
  BadgeDollarSign,
  ChevronRight,
  Copy,
  Crown,
  DoorOpen,
  Hand,
  Lock,
  MessageCircle,
  Play,
  Plus,
  RefreshCcw,
  Send,
  Shield,
  Sparkles,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { apiBaseUrl, apiGet, apiPost, getToken } from '@/api/client';
import { RequireAuth } from '@/auth/require-auth';
import { useAuth } from '@/auth/auth-context';
import { UserAvatar } from '@/components/user-avatar';
import { EmptyState, StatusMessage } from '@/components/ui';
import { emitBalanceDelta } from '@/lib/balance-events';
import type { BlackjackState, BlackjackTable, Card } from '@/types/api';

type TableForm = {
  name: string;
  maxPlayers: number;
  minBet: number;
  tableMaxBet: number;
  visibility: 'PUBLIC' | 'PRIVATE';
};

type RoundOverSummary = {
  title: string;
  detail: string;
  tableCode: string;
};

type ChatMessage = {
  id: number;
  author: string;
  text: string;
  time: string;
};

const suitAssets: Record<string, string> = {
  H: 'hearts',
  D: 'diamonds',
  C: 'clubs',
  S: 'spades',
};

function cardAsset(card?: Card) {
  if (!card) return '/assets/cards/card-back.svg';
  const suit = suitAssets[card.suit] ?? String(card.suit).toLowerCase();
  const rank = String(card.rank).toUpperCase() === 'T' ? '10' : String(card.rank).toUpperCase();
  return `/assets/cards/${suit}_${rank}.png`;
}

function BlackjackCard({ card, hidden = false, delay = 0 }: { card?: Card; hidden?: boolean; delay?: number }) {
  return (
    <span className={`blackjack-card ${hidden || !card ? 'back' : ''}`} style={{ '--deal-delay': `${delay}ms` } as React.CSSProperties}>
      <Image src={hidden || !card ? '/assets/cards/card-back.svg' : cardAsset(card)} alt={hidden || !card ? 'Carte cachee' : `${card.rank}${card.suit}`} width={190} height={266} />
    </span>
  );
}

function formatPhase(phase?: string) {
  switch (phase) {
    case 'betting':
      return 'Mises ouvertes';
    case 'player_turns':
      return 'Tour des joueurs';
    case 'dealer_turn':
      return 'Croupier';
    case 'finished':
      return 'Round termine';
    default:
      return 'Lobby';
  }
}

function tablePlayersLabel(table: BlackjackTable) {
  return `${table.players?.length ?? 0}/${table.maxPlayers}`;
}

function blackjackSocketUrl() {
  const base = apiBaseUrl();
  if (base.startsWith('http')) return base.replace(/\/api\/?$/, '');
  return 'http://127.0.0.1:3000';
}

function BlackjackContent() {
  const { user, refreshUser } = useAuth();
  const [tables, setTables] = useState<BlackjackTable[]>([]);
  const [state, setState] = useState<BlackjackState | null>(null);
  const [code, setCode] = useState('');
  const [bet, setBet] = useState(20);
  const [error, setError] = useState('');
  const [roundOver, setRoundOver] = useState<RoundOverSummary | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [avatarMap, setAvatarMap] = useState<Record<string, string | null>>({});
  const [form, setForm] = useState<TableForm>({
    name: 'River Blackjack',
    maxPlayers: 5,
    minBet: 10,
    tableMaxBet: 500,
    visibility: 'PUBLIC',
  });
  const roundOverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRoundOverKey = useRef('');
  const socketRef = useRef<Socket | null>(null);

  const tableCode = state?.tableCode ?? '';
  const game = state?.game;
  const players = useMemo(() => Object.values(game?.players ?? {}), [game?.players]);
  const me = state?.you;
  const myRound = me ? game?.players?.[String(me.userId)] : undefined;
  const currentTurnId = game?.turnOrder?.[game.currentTurnIndex ?? 0];
  const isMyTurn = Boolean(me && game?.phase === 'player_turns' && currentTurnId === me.userId);
  const canStart = Boolean(state && state.table.ownerId === user?.userId && state.table.status !== 'in_game');
  const canBet = Boolean(state && state.table.status === 'in_game' && game?.phase === 'betting' && !myRound?.bet);
  const myActiveHand = myRound?.hands?.[myRound.activeHandIndex ?? 0];
  const canAct = Boolean(isMyTurn && myActiveHand?.status === 'playing');
  const canDouble = Boolean(canAct && myActiveHand?.canDouble);
  const canSplit = Boolean(canAct && myActiveHand?.canSplit);
  const dealerCards = game?.dealer.cards ?? [];
  const dealerRevealed = game?.phase === 'dealer_turn' || game?.phase === 'finished';
  const visibleDealerValue = dealerRevealed ? game?.dealer.value ?? 0 : dealerCards.length ? '?' : 0;
  const dealStepMs = 170;

  async function loadTables() {
    setError('');
    try {
      setTables(await apiGet<BlackjackTable[]>('/blackjack/tables'));
      if (tableCode) await loadState(tableCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Blackjack indisponible');
    }
  }

  async function loadState(nextCode: string) {
    setState(await apiGet<BlackjackState>(`/blackjack/tables/${nextCode}/state`));
  }

  useEffect(() => {
    void loadTables();
  }, []);

  useEffect(() => {
    const names = Array.from(new Set(players.map((player) => player.username).filter(Boolean)));
    if (names.length <= 0) {
      setAvatarMap({});
      return;
    }

    let cancelled = false;
    apiGet<Record<string, string | null>>(`/profile/avatars?usernames=${encodeURIComponent(names.join(','))}`)
      .then((out) => {
        if (!cancelled) setAvatarMap(out ?? {});
      })
      .catch(() => {
        if (!cancelled) setAvatarMap({});
      });

    return () => {
      cancelled = true;
    };
  }, [players]);

  useEffect(() => {
    if (!tableCode) return;

    const interval = window.setInterval(async () => {
      try {
        await loadState(tableCode);
      } catch {
        // La table peut avoir ete supprimee apres un leave.
      }
    }, 1800);

    return () => window.clearInterval(interval);
  }, [tableCode]);

  useEffect(() => {
    if (!tableCode || typeof window === 'undefined') return;
    const token = getToken();
    if (!token) return;

    const socket = io(`${blackjackSocketUrl()}/blackjack`, {
      auth: { token },
      transports: ['polling', 'websocket'],
    });
    socketRef.current = socket;

    const push = (author: string, text: string, ts?: number) => {
      setMessages((previous) => [
        ...previous.slice(-80),
        {
          id: Number(ts ?? Date.now()) + previous.length,
          author,
          text,
          time: new Date(ts ?? Date.now()).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    };

    socket.on('connect', () => {
      socket.emit('joinTableChat', { tableCode });
    });
    socket.on('joinedChat', () => push('Systeme', `Chat connecte a la table ${tableCode}.`));
    socket.on('chatSystem', (payload: { message?: string; ts?: number }) => {
      if (payload?.message) push('Systeme', payload.message, payload.ts);
    });
    socket.on('chatMessage', (payload: { username?: string; message?: string; ts?: number }) => {
      if (payload?.message) push(payload.username ?? 'Joueur', payload.message, payload.ts);
    });
    socket.on('chatError', (payload: { error?: string }) => {
      push('Systeme', payload?.error ?? 'Chat indisponible');
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [tableCode]);

  useEffect(() => {
    if (!state?.game?.roundResult || state.game.phase !== 'finished') return;

    const result = state.game.roundResult;
    const resultKey = `${state.tableCode}-${state.game.round}-${result.message}`;
    if (lastRoundOverKey.current === resultKey) return;
    lastRoundOverKey.current = resultKey;

    const winners = result.winners?.length ? result.winners.join(', ') : 'Le croupier';
    if (!socketRef.current?.connected) {
      setMessages((previous) => [
        ...previous.slice(-80),
        {
          id: Date.now() + previous.length,
          author: 'Systeme',
          text: result.winners?.length ? `${winners} remporte le round. ${result.message}` : `Le croupier remporte le round. ${result.message}`,
          time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    }

    if (roundOverTimer.current) clearTimeout(roundOverTimer.current);
    roundOverTimer.current = setTimeout(async () => {
      setRoundOver(null);
      await refreshUser();
    }, 2600);
  }, [state, refreshUser]);

  useEffect(() => {
    return () => {
      if (roundOverTimer.current) clearTimeout(roundOverTimer.current);
    };
  }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      const out = await apiPost<BlackjackTable>('/blackjack/tables', form);
      setCode(out.code);
      await loadState(out.code);
      await loadTables();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Creation impossible');
    }
  }

  async function join(nextCode = code) {
    setError('');
    try {
      const normalized = nextCode.trim().toUpperCase();
      await apiPost(`/blackjack/tables/${normalized}/join`, {});
      await loadState(normalized);
      await loadTables();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de rejoindre');
    }
  }

  async function leaveTable() {
    if (!tableCode) {
      setState(null);
      return;
    }

    setError('');
    try {
      await apiPost(`/blackjack/tables/${tableCode}/leave`, {});
      setState(null);
      await refreshUser();
      await loadTables();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de quitter la table');
    }
  }

  async function call(path: string, body: unknown = {}, optimisticDelta = 0) {
    if (!tableCode) return;
    setError('');
    try {
      if (optimisticDelta !== 0) {
        emitBalanceDelta(optimisticDelta, `blackjack-${path}`);
      }
      const out = await apiPost<BlackjackState>(`/blackjack/tables/${tableCode}/${path}`, body);
      setState(out);
      await refreshUser();
    } catch (err) {
      if (optimisticDelta !== 0) {
        emitBalanceDelta(-optimisticDelta, `blackjack-${path}-refund`);
      }
      setError(err instanceof Error ? err.message : 'Action impossible');
    }
  }

  function sendMessage(event: FormEvent) {
    event.preventDefault();
    const message = chatDraft.trim();
    if (!message || !tableCode) return;
    if (socketRef.current?.connected) {
      socketRef.current.emit('sendMessage', { tableCode, message });
    } else {
      setMessages((previous) => [
        ...previous,
        {
          id: Date.now() + previous.length,
          author: user?.username ?? 'Moi',
          text: message,
          time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    }
    setChatDraft('');
  }

  function copyCode() {
    if (!tableCode || typeof navigator === 'undefined') return;
    void navigator.clipboard?.writeText(tableCode);
  }

  if (!state) {
    return (
      <section className="blackjack-page">
        <header className="blackjack-lobby-hero">
          <div className="blackjack-lobby-copy">
            <span className="welcome-pill">
              <Sparkles size={15} /> Salon blackjack
            </span>
            <h1>Choisis ta table.</h1>
            <p>Mets en place une table publique, cree une room privee ou reprends une table ouverte.</p>
          </div>
          <div className="blackjack-lobby-art" aria-hidden="true">
            <Image src="/assets/home/game-blackjack.png" alt="" width={720} height={520} priority />
          </div>
        </header>

        {error ? <StatusMessage type="error">{error}</StatusMessage> : null}

        <div className="blackjack-lobby-grid">
          <section className="blackjack-panel">
            <div className="poker-panel-heading">
              <div>
                <h2>Nouvelle table</h2>
                <p>Parametres de depart</p>
              </div>
              <Shield size={20} />
            </div>
            <form className="blackjack-create-form" onSubmit={create}>
              <label className="field">
                <span>Nom</span>
                <input value={form.name} onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))} />
              </label>
              <label className="field">
                <span>Joueurs max</span>
                <input min={1} max={6} type="number" value={form.maxPlayers} onChange={(event) => setForm((previous) => ({ ...previous, maxPlayers: Number(event.target.value) }))} />
              </label>
              <label className="field">
                <span>Mise min</span>
                <input min={1} type="number" value={form.minBet} onChange={(event) => setForm((previous) => ({ ...previous, minBet: Number(event.target.value) }))} />
              </label>
              <label className="field">
                <span>Mise max</span>
                <input min={1} type="number" value={form.tableMaxBet} onChange={(event) => setForm((previous) => ({ ...previous, tableMaxBet: Number(event.target.value) }))} />
              </label>
              <div className="poker-visibility-control">
                <span>Visibilite</span>
                <div className="segmented-control full">
                  <button className={form.visibility === 'PUBLIC' ? 'active' : ''} onClick={() => setForm((previous) => ({ ...previous, visibility: 'PUBLIC' }))} type="button">
                    Publique
                  </button>
                  <button className={form.visibility === 'PRIVATE' ? 'active' : ''} onClick={() => setForm((previous) => ({ ...previous, visibility: 'PRIVATE' }))} type="button">
                    Privee
                  </button>
                </div>
              </div>
              <button className="button" type="submit">
                <Plus size={18} /> Creer la table
              </button>
            </form>
          </section>

          <section className="blackjack-panel">
            <div className="poker-panel-heading">
              <div>
                <h2>Code prive</h2>
                <p>Rejoins une table masquee</p>
              </div>
              <Lock size={20} />
            </div>
            <form className="blackjack-code-form" onSubmit={(event) => { event.preventDefault(); void join(); }}>
              <label className="field">
                <span>Code table</span>
                <input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} maxLength={6} placeholder="RIVER7" />
              </label>
              <button className="button secondary" type="submit">
                Rejoindre <ArrowRight size={18} />
              </button>
            </form>
          </section>

          <section className="blackjack-panel blackjack-public-panel">
            <div className="poker-panel-heading">
              <div>
                <h2>Tables publiques</h2>
                <p>Places disponibles</p>
              </div>
              <button className="icon-button" onClick={() => void loadTables()} type="button" aria-label="Actualiser">
                <RefreshCcw size={18} />
              </button>
            </div>
            <div className="blackjack-table-list">
              {tables.length ? (
                tables.map((table) => (
                  <article className="blackjack-public-table" key={table.code}>
                    <div>
                      <strong>{table.name}</strong>
                      <span>{table.code} · {table.status} · {tablePlayersLabel(table)} joueurs</span>
                    </div>
                    <button className="button secondary small" onClick={() => void join(table.code)} type="button">
                      Entrer
                    </button>
                  </article>
                ))
              ) : (
                <EmptyState title="Aucune table publique" text="Cree la premiere table blackjack." />
              )}
            </div>
          </section>
        </div>
      </section>
    );
  }

  return (
    <section className={`blackjack-game-shell ${chatOpen ? 'chat-open' : ''}`}>
      <header className="blackjack-game-header">
        <div>
          <span className="welcome-pill">
            <Trophy size={15} /> Table active
          </span>
          <h1>{state.table.name}</h1>
          <p>{state.tableCode} - {state.table.status} - {formatPhase(game?.phase)}</p>
        </div>
        <div className="poker-game-actions">
          <button className="button secondary" onClick={() => void loadState(state.tableCode)} type="button">
            <RefreshCcw size={17} /> Sync
          </button>
          <button className="button secondary" onClick={copyCode} type="button">
            <Copy size={17} /> Code
          </button>
          <button className="button secondary" onClick={() => setChatOpen((open) => !open)} type="button">
            <MessageCircle size={17} /> Chat {messages.length ? `(${messages.length})` : ''}
          </button>
          <button className="icon-button" onClick={() => void leaveTable()} type="button" aria-label="Quitter la table">
            <DoorOpen size={18} />
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

      <main className="blackjack-game-layout">
        <div className="blackjack-play-area">
        <section className="blackjack-table-scene">
          <div className="blackjack-rail" />
          <div className="blackjack-felt" />
          <div className="blackjack-deck" aria-hidden="true">
            <Image src="/assets/cards/card-back.svg" alt="" width={190} height={266} />
            <Image src="/assets/cards/card-back.svg" alt="" width={190} height={266} />
            <Image src="/assets/cards/card-back.svg" alt="" width={190} height={266} />
          </div>

          <div className="blackjack-dealer">
            <div className="blackjack-seat-label">
              <Crown size={16} />
              <span>Croupier</span>
              <strong>{visibleDealerValue}</strong>
            </div>
            <div className="blackjack-card-row">
              {dealerCards.map((card, index) => (
                <BlackjackCard
                  card={card}
                  delay={(index === 0 ? players.length : players.length * 2 + 1) * dealStepMs}
                  hidden={!card || (index === 0 && !dealerRevealed)}
                  key={card ? `${card.rank}-${card.suit}-${index}-${dealerRevealed ? 'show' : 'hide'}` : `dealer-${index}`}
                />
              ))}
            </div>
          </div>

          <div className="blackjack-player-ring">
            {players.map((player, index) => (
              <article className={`blackjack-player-seat seat-${index + 1} ${player.userId === user?.userId ? 'hero' : ''} ${currentTurnId === player.userId ? 'active' : ''}`} key={player.userId}>
                <div className="blackjack-seat-label">
                  <UserAvatar
                    avatarUrl={avatarMap[player.username] ?? (player.userId === user?.userId ? user?.avatarUrl ?? null : null)}
                    className="blackjack-avatar"
                    label={player.username}
                  />
                  <span>{player.username}{player.userId === user?.userId ? ' (toi)' : ''}</span>
                  <strong>{player.hands && player.hands.length > 1 ? `${player.activeHandIndex! + 1}/${player.hands.length}` : player.value}</strong>
                </div>
                <div className="blackjack-hands">
                  {(player.hands?.length ? player.hands : player.cards.length ? [{ id: 'main', cards: player.cards, value: player.value, bet: player.bet, status: player.status, active: true }] : []).map((hand, handIndex) => (
                    <div className={`blackjack-hand ${hand.active ? 'active' : ''}`} key={`${player.userId}-${hand.id}`}>
                      <div className="blackjack-card-row">
                        {hand.cards.map((card, cardIndex) => (
                          <BlackjackCard
                            card={card}
                            delay={(cardIndex === 0 ? index : cardIndex === 1 ? players.length + 1 + index : 1) * dealStepMs}
                            hidden={!card}
                            key={`${player.userId}-${hand.id}-${card.rank}-${card.suit}-${cardIndex}`}
                          />
                        ))}
                      </div>
                      <span>{player.hands && player.hands.length > 1 ? `Main ${handIndex + 1} - ` : ''}{hand.value} - {hand.bet} credits</span>
                    </div>
                  ))}
                </div>
                <div className="blackjack-seat-meta">
                  <span>{player.status}</span>
                  <span>{player.bet} credits</span>
                </div>
              </article>
            ))}
          </div>

          {game?.roundResult ? (
            <div className="blackjack-result-banner">
              <Trophy size={18} />
              <span>{game.roundResult.message}</span>
            </div>
          ) : null}
        </section>

        <section className="blackjack-control-panel">
          <div className="blackjack-status-card">
            <span>Round</span>
            <strong>#{game?.round ?? 0}</strong>
            <p>{formatPhase(game?.phase)}</p>
          </div>
          <div className="blackjack-actions">
            <button className="button" disabled={!canStart} onClick={() => void call('start')} type="button">
              <Play size={18} /> Start
            </button>
            <label className="blackjack-bet-input">
              <span>Mise</span>
              <input min={state.table.minBet} max={state.table.tableMaxBet ?? undefined} type="number" value={bet} onChange={(event) => setBet(Number(event.target.value))} />
            </label>
            <button className="button secondary" disabled={!canBet} onClick={() => void call('bet', { amount: bet }, -Number(bet))} type="button">
              <BadgeDollarSign size={18} /> Miser
            </button>
            <button className="button secondary" disabled={!canAct} onClick={() => void call('action', { action: 'hit' })} type="button">
              <Plus size={18} /> Hit
            </button>
            <button className="button secondary" disabled={!canDouble} onClick={() => void call('action', { action: 'double' }, -Number(myActiveHand?.bet ?? myRound?.bet ?? bet))} type="button">
              x2 Double
            </button>
            <button className="button secondary" disabled={!canSplit} onClick={() => void call('action', { action: 'split' }, -Number(myActiveHand?.bet ?? myRound?.bet ?? bet))} type="button">
              Split
            </button>
            <button className="button stand" disabled={!canAct} onClick={() => void call('action', { action: 'stand' })} type="button">
              <Hand size={18} /> Stand
            </button>
          </div>
        </section>
        </div>

        {chatOpen ? (
          <aside className="poker-chat-panel blackjack-chat-panel">
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
                  <span>{message.author} - {message.time}</span>
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
        ) : null}
      </main>
    </section>
  );
}

export default function BlackjackPage() {
  return (
    <RequireAuth>
      <BlackjackContent />
    </RequireAuth>
  );
}
