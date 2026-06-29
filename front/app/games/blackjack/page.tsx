'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Play, Plus, RefreshCcw } from 'lucide-react';
import { apiGet, apiPost } from '@/api/client';
import { RequireAuth } from '@/auth/require-auth';
import { useAuth } from '@/auth/auth-context';
import { EmptyState, PlayingCard, StatusMessage } from '@/components/ui';
import type { BlackjackState, BlackjackTable } from '@/types/api';

function BlackjackContent() {
  const { user, refreshUser } = useAuth();
  const [tables, setTables] = useState<BlackjackTable[]>([]);
  const [state, setState] = useState<BlackjackState | null>(null);
  const [code, setCode] = useState('');
  const [bet, setBet] = useState(20);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: 'River table', maxPlayers: 6, minBet: 10, tableMaxBet: 500 });

  async function loadTables() {
    try {
      setTables(await apiGet<BlackjackTable[]>('/blackjack/tables'));
      if (state?.tableCode) await loadState(state.tableCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Blackjack indisponible');
    }
  }

  async function loadState(tableCode: string) {
    setState(await apiGet<BlackjackState>(`/blackjack/tables/${tableCode}/state`));
  }

  useEffect(() => {
    void loadTables();
  }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    try {
      const out = await apiPost<BlackjackTable>('/blackjack/tables', form);
      setCode(out.code);
      await loadTables();
      await apiPost(`/blackjack/tables/${out.code}/join`, {});
      await loadState(out.code);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Creation impossible');
    }
  }

  async function join(tableCode = code) {
    try {
      await apiPost(`/blackjack/tables/${tableCode}/join`, {});
      await loadState(tableCode);
      await loadTables();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de rejoindre');
    }
  }

  async function call(path: string, body: unknown = {}) {
    if (!state?.tableCode) return;
    try {
      const out = await apiPost<BlackjackState>(`/blackjack/tables/${state.tableCode}/${path}`, body);
      setState(out);
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action impossible');
    }
  }

  const players = Object.values(state?.game?.players ?? {});

  return (
    <section className="page">
      <div className="page-title">
        <div>
          <h1>Blackjack</h1>
          <p>Lobby, mises et actions joueur.</p>
        </div>
        <button className="button secondary" onClick={() => void loadTables()} type="button">
          <RefreshCcw size={18} /> Actualiser
        </button>
      </div>
      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}

      <div className="grid two">
        <form className="panel" onSubmit={create}>
          <h2>Creer une table</h2>
          <div className="form-grid">
            <label className="field">
              <span>Nom</span>
              <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            </label>
            <label className="field">
              <span>Joueurs max</span>
              <input type="number" value={form.maxPlayers} onChange={(e) => setForm((p) => ({ ...p, maxPlayers: Number(e.target.value) }))} />
            </label>
            <label className="field">
              <span>Mise min</span>
              <input type="number" value={form.minBet} onChange={(e) => setForm((p) => ({ ...p, minBet: Number(e.target.value) }))} />
            </label>
            <label className="field">
              <span>Mise max</span>
              <input type="number" value={form.tableMaxBet} onChange={(e) => setForm((p) => ({ ...p, tableMaxBet: Number(e.target.value) }))} />
            </label>
          </div>
          <button className="button" type="submit">
            <Plus size={18} /> Creer
          </button>
        </form>

        <section className="panel">
          <h2>Table active</h2>
          {state ? (
            <div className="grid">
              <div className="table-meta">
                <span className="chip">{state.tableCode}</span>
                <span className="chip">{state.table.status}</span>
                <span className="chip">{state.game?.phase ?? 'lobby'}</span>
              </div>
              <div className="card-row">
                {(state.game?.dealer.cards ?? []).map((card, index) => (
                  <PlayingCard card={card} key={`${card.rank}${card.suit}${index}`} />
                ))}
                <span className="chip">Dealer {state.game?.dealer.value ?? 0}</span>
              </div>
              <div className="game-actions">
                <button className="button" onClick={() => void call('start')} type="button">
                  <Play size={18} /> Start
                </button>
                <input className="field-input" min={1} type="number" value={bet} onChange={(e) => setBet(Number(e.target.value))} />
                <button className="button secondary" onClick={() => void call('bet', { amount: bet })} type="button">
                  Miser
                </button>
                <button className="button secondary" onClick={() => void call('action', { action: 'hit' })} type="button">
                  Hit
                </button>
                <button className="button danger" onClick={() => void call('action', { action: 'stand' })} type="button">
                  Stand
                </button>
              </div>
              {players.map((player) => (
                <div className="table-card" key={player.userId}>
                  <h3>{player.username}{player.userId === user?.userId ? ' (toi)' : ''}</h3>
                  <div className="card-row">
                    {player.cards.map((card, index) => <PlayingCard card={card} key={`${card.rank}${card.suit}${index}`} />)}
                  </div>
                  <div className="table-meta">
                    <span className="chip">{player.status}</span>
                    <span className="chip">Valeur {player.value}</span>
                    <span className="chip">Mise {player.bet}</span>
                  </div>
                </div>
              ))}
              {state.game?.roundResult ? <StatusMessage type="success">{state.game.roundResult.message}</StatusMessage> : null}
            </div>
          ) : (
            <form className="grid" onSubmit={(e) => { e.preventDefault(); void join(); }}>
              <label className="field">
                <span>Code table</span>
                <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6} />
              </label>
              <button className="button secondary" type="submit">Rejoindre</button>
            </form>
          )}
        </section>
      </div>

      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Tables blackjack</h2>
        <div className="grid three">
          {tables.length ? tables.map((table) => (
            <div className="table-card" key={table.code}>
              <h3>{table.name}</h3>
              <div className="table-meta">
                <span className="chip">{table.code}</span>
                <span className="chip">{table.status}</span>
                <span className="chip">{table.players?.length ?? 0}/{table.maxPlayers}</span>
              </div>
              <button className="button secondary" onClick={() => void join(table.code)} type="button">Rejoindre</button>
            </div>
          )) : <EmptyState title="Aucune table" text="Cree la premiere table blackjack." />}
        </div>
      </section>
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
