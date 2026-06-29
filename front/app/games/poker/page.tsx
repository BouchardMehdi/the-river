'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Play, Plus, RefreshCcw, Users } from 'lucide-react';
import { apiGet, apiPost } from '@/api/client';
import { RequireAuth } from '@/auth/require-auth';
import { useAuth } from '@/auth/auth-context';
import { EmptyState, PlayingCard, StatusMessage } from '@/components/ui';
import type { Card, PokerTable } from '@/types/api';

function tableIdOf(table: PokerTable) {
  return table.id ?? table.tableId ?? table.name ?? '';
}

function PokerContent() {
  const { user, refreshUser } = useAuth();
  const [tables, setTables] = useState<PokerTable[]>([]);
  const [active, setActive] = useState<PokerTable | null>(null);
  const [hand, setHand] = useState<Card[]>([]);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({ buyInAmount: 100, smallBlindAmount: 5, bigBlindAmount: 10, maxPlayers: 6, fillWithBots: true });

  async function loadTables() {
    setError('');
    try {
      setTables(await apiGet<PokerTable[]>('/tables/public', false));
      if (active) await loadTable(tableIdOf(active));
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

  async function create(event: FormEvent) {
    event.preventDefault();
    try {
      const out = await apiPost<{ tableId: string; table: PokerTable }>('/tables/create', {
        ...form,
        visibility: 'PUBLIC',
      });
      await refreshUser();
      setActive(out.table);
      await loadTables();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Creation impossible');
    }
  }

  async function join(id: string) {
    try {
      const table = await apiPost<PokerTable>('/tables/join-public', { tableId: id });
      await refreshUser();
      setActive(table);
      await loadTable(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de rejoindre');
    }
  }

  async function joinPrivate(event: FormEvent) {
    event.preventDefault();
    try {
      const table = await apiPost<PokerTable>('/tables/join', { code });
      setActive(table);
      await loadTable(tableIdOf(table));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Code invalide');
    }
  }

  async function action(actionName: string, amount?: number) {
    if (!active) return;
    try {
      const id = tableIdOf(active);
      const table = await apiPost<PokerTable>(`/tables/${id}/action`, { action: actionName, amount });
      setActive(table);
      await loadTable(id);
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action impossible');
    }
  }

  async function start() {
    if (!active) return;
    try {
      const id = tableIdOf(active);
      const table = await apiPost<PokerTable>(`/tables/${id}/start`, {});
      setActive(table);
      await loadTable(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demarrage impossible');
    }
  }

  return (
    <section className="page">
      <div className="page-title">
        <div>
          <h1>Poker</h1>
          <p>Tables publiques, creation rapide et actions essentielles.</p>
        </div>
        <button className="button secondary" onClick={() => void loadTables()} type="button">
          <RefreshCcw size={18} /> Actualiser
        </button>
      </div>
      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}

      <div className="grid two">
        <section className="panel">
          <h2>Creer une table</h2>
          <form className="grid" onSubmit={create}>
            <div className="form-grid">
              {[
                ['Buy-in', 'buyInAmount'],
                ['Small blind', 'smallBlindAmount'],
                ['Big blind', 'bigBlindAmount'],
                ['Joueurs max', 'maxPlayers'],
              ].map(([label, key]) => (
                <label className="field" key={key}>
                  <span>{label}</span>
                  <input
                    type="number"
                    min={1}
                    value={(form as any)[key]}
                    onChange={(e) => setForm((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
                  />
                </label>
              ))}
            </div>
            <label className="tag">
              <input
                type="checkbox"
                checked={form.fillWithBots}
                onChange={(e) => setForm((prev) => ({ ...prev, fillWithBots: e.target.checked }))}
              />
              Bots
            </label>
            <button className="button" type="submit">
              <Plus size={18} /> Creer
            </button>
          </form>
          <form className="grid" onSubmit={joinPrivate} style={{ marginTop: 18 }}>
            <h2>Rejoindre par code</h2>
            <label className="field">
              <span>Code table</span>
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6} />
            </label>
            <button className="button secondary" type="submit">
              <Users size={18} /> Rejoindre
            </button>
          </form>
        </section>

        <section className="panel">
          <h2>Table active</h2>
          {active ? (
            <div className="grid">
              <div className="table-meta">
                <span className="chip">{tableIdOf(active)}</span>
                <span className="chip">{active.status}</span>
                <span className="chip">{active.phase}</span>
                <span className="chip">Pot {active.pot ?? 0}</span>
              </div>
              <div className="card-row">{hand.map((card, index) => <PlayingCard card={card} key={`${card.rank}${card.suit}${index}`} />)}</div>
              <div className="card-row">
                {(active.communityCards ?? []).map((card, index) => (
                  <PlayingCard card={card} key={`${card.rank}${card.suit}${index}`} />
                ))}
              </div>
              <div className="game-actions">
                <button className="button" onClick={() => void start()} type="button">
                  <Play size={18} /> Start
                </button>
                <button className="button secondary" onClick={() => void action('CHECK')} type="button">
                  Check
                </button>
                <button className="button secondary" onClick={() => void action('CALL')} type="button">
                  Call
                </button>
                <button className="button secondary" onClick={() => void action('BET', 10)} type="button">
                  Bet 10
                </button>
                <button className="button danger" onClick={() => void action('FOLD')} type="button">
                  Fold
                </button>
              </div>
              <div className="mini-list">
                {(active.players ?? []).map((player) => (
                  <span className="chip" key={player}>
                    {player} {active.stacks?.[player] ?? ''}
                  </span>
                ))}
              </div>
              {active.lastWinnerId ? <StatusMessage type="success">{active.lastWinnerId} - {active.lastWinnerHandDescription}</StatusMessage> : null}
            </div>
          ) : (
            <EmptyState title="Aucune table active" text="Cree une table ou rejoins une table publique." />
          )}
        </section>
      </div>

      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Tables publiques</h2>
        <div className="grid three">
          {tables.length ? (
            tables.map((table) => {
              const id = tableIdOf(table);
              return (
                <div className="table-card" key={id}>
                  <h3>{id}</h3>
                  <div className="table-meta">
                    <span className="chip">{table.status}</span>
                    <span className="chip">{table.players?.length ?? 0} joueurs</span>
                  </div>
                  <button className="button secondary" onClick={() => void join(id)} type="button">
                    Rejoindre
                  </button>
                </div>
              );
            })
          ) : (
            <EmptyState title="Aucune table publique" text="Cree la premiere table ouverte." />
          )}
        </div>
      </section>
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
