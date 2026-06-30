'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  Dice5,
  Goal,
  History,
  LayoutDashboard,
  LogOut,
  Settings,
  Target,
  Trophy,
} from 'lucide-react';
import { apiGet, apiPost } from '@/api/client';
import { RequireAuth } from '@/auth/require-auth';
import { useAuth } from '@/auth/auth-context';
import { StatusMessage } from '@/components/ui';
import type { Quest } from '@/types/api';

type PerfEvent = {
  game?: string;
  deltaCredits?: number;
  deltaPoints?: number;
  createdAt?: string;
  meta?: unknown;
};

type Perf = {
  totals?: { credits?: number; points?: number; games?: number };
  recent?: PerfEvent[];
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

const dashboardNav = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
  { icon: BarChart3, label: 'Statistiques', href: '/dashboard' },
  { icon: Dice5, label: 'Jeux', href: '/games' },
  { icon: History, label: 'Historique', href: '/dashboard' },
  { icon: Goal, label: 'Objectifs', href: '/dashboard' },
  { icon: Settings, label: 'Parametres', href: '/dashboard' },
];

const defaultActivity: PerfEvent[] = [
  { game: 'SLOTS', deltaCredits: 200, createdAt: new Date().toISOString() },
  { game: 'ROULETTE', deltaCredits: -75, createdAt: new Date().toISOString() },
  { game: 'POKER', deltaCredits: 125, createdAt: new Date().toISOString() },
  { game: 'BLACKJACK', deltaCredits: -50, createdAt: new Date().toISOString() },
];

function formatCredits(value: number | undefined | null) {
  return `${Number(value ?? 0).toLocaleString('fr-FR')} crédits`;
}

function formatDate(value?: string) {
  if (!value) return 'Session recente';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function gameLabel(game?: string) {
  const key = String(game ?? 'GLOBAL').toUpperCase();
  if (key === 'SLOTS') return 'Machine a sous';
  if (key === 'ROULETTE') return 'Roulette';
  if (key === 'POKER') return 'Poker';
  if (key === 'BLACKJACK') return 'Blackjack';
  return 'Casino';
}

function DashboardContent() {
  const { user, logout, refreshUser } = useAuth();
  const [perf, setPerf] = useState<Perf | null>(null);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [egg, setEgg] = useState<EggStatus | null>(null);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    try {
      const [perfOut, questsOut, leadersOut, eggOut] = await Promise.all([
        apiGet<Perf>('/dashboard/perf?limit=10').catch(() => null),
        apiGet<Quest[]>('/quests').catch(() => []),
        apiGet<Leader[]>('/dashboard/balance-leaderboard?limit=5', false).catch(() => []),
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

  const activity = useMemo(() => {
    const recent = perf?.recent && perf.recent.length > 0 ? perf.recent : defaultActivity;
    return recent.slice(0, 6);
  }, [perf]);

  const totals = useMemo(() => {
    const gains = activity.filter((event) => Number(event.deltaCredits ?? 0) > 0).reduce((sum, event) => sum + Number(event.deltaCredits ?? 0), 0);
    const losses = Math.abs(
      activity.filter((event) => Number(event.deltaCredits ?? 0) < 0).reduce((sum, event) => sum + Number(event.deltaCredits ?? 0), 0),
    );
    const net = gains - losses;
    const roi = losses > 0 ? (net / losses) * 100 : gains > 0 ? 100 : 0;
    return { gains, losses, net, roi };
  }, [activity]);

  const gameTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const event of activity) {
      const key = gameLabel(event.game);
      map.set(key, (map.get(key) ?? 0) + Math.abs(Number(event.deltaCredits ?? 0)));
    }
    const fallback = [
      ['Machine a sous', 45],
      ['Roulette', 25],
      ['Poker', 20],
      ['Blackjack', 10],
    ] as const;
    return map.size > 0 ? Array.from(map.entries()) : fallback.map(([label, value]) => [label, value]);
  }, [activity]);

  const bestGame = useMemo(() => {
    const scores = new Map<string, number>();
    for (const event of activity) {
      const key = gameLabel(event.game);
      scores.set(key, (scores.get(key) ?? 0) + Number(event.deltaCredits ?? 0));
    }
    const sorted = Array.from(scores.entries()).sort((a, b) => b[1] - a[1]);
    return sorted[0] ?? ['Machine a sous', 0];
  }, [activity]);

  const chartPoints = [18, 38, 28, 58, 46, 74, 64, 86];
  const totalDistribution = gameTotals.reduce((sum, [, value]) => sum + Number(value), 0) || 1;

  return (
    <section className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <Link className="dashboard-brand" href="/">
          <Image src="/assets/logo-the-river.png" alt="THE RIVER" width={44} height={44} />
          <span>THE RIVER</span>
        </Link>

        <nav className="dashboard-menu" aria-label="Dashboard">
          {dashboardNav.map((item, index) => {
            const Icon = item.icon;
            return (
              <Link className={index === 0 ? 'dashboard-menu-item active' : 'dashboard-menu-item'} href={item.href} key={item.label}>
                <Icon size={18} />
                <span>{item.label}</span>
              </Link>
            );
          })}
          <button className="dashboard-menu-item" onClick={logout} type="button">
            <LogOut size={18} />
            <span>Deconnexion</span>
          </button>
        </nav>

        <div className="sidebar-balance">
          <span>Solde total</span>
          <strong>{formatCredits(user?.credits)}</strong>
          <Link href="/games">Jouer maintenant</Link>
        </div>
      </aside>

      <div className="dashboard-main">
        <header className="dashboard-header">
          <div>
            <h1>Bonjour, {user?.username ?? 'joueur'} !</h1>
            <p>Voici un apercu de vos performances globales.</p>
          </div>
          <div className="dashboard-actions">
            <span className="date-filter">
              <CalendarDays size={16} /> 7 derniers jours
            </span>
            <button className="icon-button" type="button" title="Notifications">
              <Bell size={18} />
            </button>
          </div>
        </header>

        {error ? <StatusMessage type="error">{error}</StatusMessage> : null}

        <div className="dashboard-kpis">
          <article className="metric-card">
            <span>Mises totales</span>
            <strong>{formatCredits(totals.gains + totals.losses)}</strong>
            <em className="positive">+12.5% vs periode precedente</em>
          </article>
          <article className="metric-card">
            <span>Gains totaux</span>
            <strong>{formatCredits(totals.gains)}</strong>
            <em className="positive">+18.3% vs periode precedente</em>
          </article>
          <article className="metric-card">
            <span>Pertes totales</span>
            <strong>{formatCredits(totals.losses)}</strong>
            <em className="negative">-8.7% vs periode precedente</em>
          </article>
          <article className="metric-card">
            <span>Performance</span>
            <strong>{totals.roi.toFixed(2)}%</strong>
            <em className={totals.roi >= 0 ? 'positive' : 'negative'}>{formatCredits(totals.net)} net</em>
          </article>
        </div>

        <section className="analytics-card chart-card">
          <div className="card-heading">
            <h2>Evolution des performances</h2>
            <div className="legend">
              <span><i className="blue-dot" /> Mises</span>
              <span><i className="green-dot" /> Gains</span>
              <span><i className="red-dot" /> Pertes</span>
            </div>
          </div>
          <svg className="performance-chart" viewBox="0 0 760 260" role="img" aria-label="Evolution des performances">
            <defs>
              <linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#29e59d" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#29e59d" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[40, 90, 140, 190, 240].map((y) => (
              <line className="chart-grid-line" x1="20" x2="740" y1={y} y2={y} key={y} />
            ))}
            <polyline className="chart-line blue" points={chartPoints.map((y, i) => `${30 + i * 100},${220 - y * 1.7}`).join(' ')} />
            <polyline className="chart-line green" points={chartPoints.map((y, i) => `${30 + i * 100},${230 - ((y + (i % 2 ? 10 : -8)) * 1.45)}`).join(' ')} />
            <polyline className="chart-line red" points={chartPoints.map((y, i) => `${30 + i * 100},${230 - ((92 - y + (i % 3) * 7) * 1.25)}`).join(' ')} />
            {chartPoints.map((y, i) => (
              <circle className="chart-point" cx={30 + i * 100} cy={220 - y * 1.7} r="4" key={i} />
            ))}
          </svg>
        </section>

        <div className="dashboard-grid">
          <section className="analytics-card">
            <div className="card-heading">
              <h2>Repartition par jeu</h2>
            </div>
            <div className="donut-row">
              <div className="donut-chart">
                <span>Mises totales</span>
                <strong>{formatCredits(totals.gains + totals.losses)}</strong>
              </div>
              <div className="distribution-list">
                {gameTotals.map(([label, value], index) => (
                  <div className="distribution-item" key={label}>
                    <span><i className={`dist-dot dist-${index}`} /> {label}</span>
                    <strong>{Math.round((Number(value) / totalDistribution) * 100)}%</strong>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="analytics-card best-game-card">
            <div className="card-heading">
              <h2>Jeu le plus rentable</h2>
            </div>
            <div className="best-game">
              <div className="slot-badge">777</div>
              <div>
                <h3>{bestGame[0]}</h3>
                <span>Gain net</span>
              </div>
              <strong>{formatCredits(Number(bestGame[1]))}</strong>
            </div>
            <div className="best-game-stats">
              <span>Crédits gagnes</span>
              <strong>{formatCredits(totals.gains)}</strong>
              <span>Crédits perdus</span>
              <strong>{formatCredits(totals.losses)}</strong>
            </div>
            <Link className="button secondary" href="/games">
              Voir les jeux
            </Link>
          </section>
        </div>

        <section className="analytics-card">
          <div className="card-heading">
            <h2>Activite recente</h2>
            <Link href="/games">Voir toute l'activite</Link>
          </div>
          <div className="activity-table">
            <div className="activity-head">
              <span>Jeu</span>
              <span>Action</span>
              <span>Montant</span>
              <span>Resultat</span>
              <span>Date</span>
            </div>
            {activity.map((event, index) => {
              const delta = Number(event.deltaCredits ?? 0);
              return (
                <div className="activity-row" key={`${event.game}-${event.createdAt}-${index}`}>
                  <span>{gameLabel(event.game)}</span>
                  <span>{delta >= 0 ? 'Gain' : 'Mise'}</span>
                  <span>{formatCredits(Math.abs(delta))}</span>
                  <strong className={delta >= 0 ? 'positive' : 'negative'}>{formatCredits(delta)}</strong>
                  <span>{formatDate(event.createdAt)}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="analytics-card quests-card">
          <div className="card-heading">
            <h2>Objectifs</h2>
            <span>{egg?.unlockedCount ?? 0}/{egg?.total ?? 4} cles secretes</span>
          </div>
          <div className="quest-strip">
            {quests.slice(0, 4).map((quest) => {
              const done = quest.completed || (quest.progress ?? 0) >= (quest.target ?? 1);
              return (
                <article className="quest-mini-card" key={quest.key}>
                  <Target size={18} />
                  <h3>{quest.title ?? quest.label ?? quest.key}</h3>
                  <span>{quest.progress ?? 0}/{quest.target ?? 1}</span>
                  {done && !quest.claimed ? (
                    <button className="button small" onClick={() => void claim(quest.key)} type="button">
                      Claim
                    </button>
                  ) : null}
                </article>
              );
            })}
            {Object.entries(egg?.keys ?? { slots: false, blackjack: false, roulette: false, poker: false }).map(([key, unlocked]) => (
              <article className="quest-mini-card" key={key}>
                <Trophy size={18} />
                <h3>{key}</h3>
                <span>{unlocked ? <Check size={14} /> : 'A trouver'}</span>
              </article>
            ))}
          </div>
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
