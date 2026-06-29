'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Award, Check, Gift, RotateCcw } from 'lucide-react';
import { apiGet, apiPost } from '@/api/client';
import { RequireAuth } from '@/auth/require-auth';
import { useAuth } from '@/auth/auth-context';
import { EmptyState, StatTile, StatusMessage } from '@/components/ui';
import type { Quest } from '@/types/api';

type Perf = {
  totals?: { credits?: number; points?: number; games?: number };
  recent?: Array<{ game?: string; deltaCredits?: number; deltaPoints?: number; createdAt?: string }>;
};

type Leader = {
  username?: string;
  value?: number;
  credits?: number;
  points?: number;
};

type EggStatus = {
  keys?: Record<string, boolean>;
  unlockedCount?: number;
  total?: number;
  allKeys?: boolean;
  visited?: boolean;
};

function DashboardContent() {
  const { user, refreshUser } = useAuth();
  const [perf, setPerf] = useState<Perf | null>(null);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [egg, setEgg] = useState<EggStatus | null>(null);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    try {
      const [perfOut, questsOut, leadersOut, eggOut] = await Promise.all([
        apiGet<Perf>('/dashboard/perf?limit=8').catch(() => null),
        apiGet<Quest[]>('/quests').catch(() => []),
        apiGet<Leader[]>('/dashboard/balance-leaderboard?limit=8', false).catch(() => []),
        apiGet<EggStatus>('/easter-egg/status').catch(() => null),
      ]);
      setPerf(perfOut);
      setQuests(Array.isArray(questsOut) ? questsOut : []);
      setLeaders(Array.isArray(leadersOut) ? leadersOut : []);
      setEgg(eggOut);
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dashboard indisponible');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function claim(key: string) {
    try {
      await apiPost(`/quests/${key}/claim`, {});
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recompense impossible');
    }
  }

  return (
    <section className="page">
      <div className="page-title">
        <div>
          <h1>Dashboard</h1>
          <p>{user?.username}, ton casino personnel en un coup d'oeil.</p>
        </div>
        <button className="button secondary" onClick={() => void load()} type="button">
          <RotateCcw size={18} /> Actualiser
        </button>
      </div>

      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}

      <div className="stat-strip">
        <StatTile label="Credits" value={user?.credits ?? 0} />
        <StatTile label="Points" value={user?.points ?? 0} />
        <StatTile label="Parties recentes" value={perf?.totals?.games ?? perf?.recent?.length ?? 0} />
        <StatTile label="Cles secretes" value={`${egg?.unlockedCount ?? 0}/${egg?.total ?? 4}`} />
      </div>

      <div className="grid two">
        <section className="panel">
          <h2>Jeux</h2>
          <div className="grid two">
            {[
              ['Poker', '/games/poker'],
              ['Blackjack', '/games/blackjack'],
              ['Roulette', '/games/roulette'],
              ['Slots', '/games/slots'],
              ['Craps', '/games/craps'],
              ['Easter egg', '/easter-egg'],
            ].map(([label, href]) => (
              <Link className="button secondary" href={href} key={href}>
                {label}
              </Link>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>Classement credits</h2>
          {leaders.length ? (
            <div className="grid">
              {leaders.map((leader, index) => (
                <div className="table-meta" key={`${leader.username}-${index}`}>
                  <span className="chip">#{index + 1}</span>
                  <span className="chip">{leader.username ?? 'Joueur'}</span>
                  <span className="chip">{leader.value ?? leader.credits ?? leader.points ?? 0}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Aucun score" text="Le classement apparaitra apres les premieres parties." />
          )}
        </section>
      </div>

      <div className="grid two" style={{ marginTop: 16 }}>
        <section className="panel">
          <h2>Quetes</h2>
          {quests.length ? (
            <div className="grid">
              {quests.slice(0, 8).map((quest) => {
                const progress = `${quest.progress ?? 0}/${quest.target ?? 1}`;
                const done = quest.completed || (quest.progress ?? 0) >= (quest.target ?? 1);
                return (
                  <div className="table-card" key={quest.key}>
                    <div>
                      <h3>{quest.title ?? quest.label ?? quest.key}</h3>
                      <p>{quest.description ?? progress}</p>
                    </div>
                    <div className="table-meta">
                      <span className="chip">
                        <Award size={14} /> {progress}
                      </span>
                      {quest.claimed ? <span className="chip">Claimed</span> : null}
                    </div>
                    {done && !quest.claimed ? (
                      <button className="button" onClick={() => void claim(quest.key)} type="button">
                        <Gift size={18} /> Claim
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState title="Quetes indisponibles" text="Elles se chargeront quand le backend aura des objectifs actifs." />
          )}
        </section>

        <section className="panel">
          <h2>Easter egg</h2>
          <p>Les cles se debloquent dans les jeux.</p>
          <div className="grid">
            {Object.entries(egg?.keys ?? { slots: false, blackjack: false, roulette: false, poker: false }).map(
              ([key, unlocked]) => (
                <div className="table-meta" key={key}>
                  <span className="chip">{key}</span>
                  <span className="chip">
                    {unlocked ? <Check size={14} /> : null}
                    {unlocked ? 'Debloquee' : 'Verrouillee'}
                  </span>
                </div>
              ),
            )}
          </div>
          {egg?.allKeys ? (
            <Link className="button" href="/easter-egg" style={{ marginTop: 16 }}>
              Ouvrir
            </Link>
          ) : null}
        </section>
      </div>
    </section>
  );
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardContent />
    </RequireAuth>
  );
}
