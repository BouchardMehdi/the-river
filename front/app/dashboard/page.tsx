'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Check,
  ChevronRight,
  ListChecks,
  SlidersHorizontal,
  Sparkles,
  Target,
  Trophy,
  X,
} from 'lucide-react';
import { apiGet, apiPost } from '@/api/client';
import { RequireAuth } from '@/auth/require-auth';
import { useAuth } from '@/auth/auth-context';
import { StatusMessage } from '@/components/ui';
import type { Quest } from '@/types/api';

type PerfEvent = {
  id?: number;
  game?: string;
  deltaCredits?: number;
  deltaPoints?: number;
  createdAt?: string;
  meta?: unknown;
};

type DashboardSummary = {
  balance?: number;
  byGame?: Array<{
    events?: number;
    game?: string;
    gains?: number;
    losses?: number;
    net?: number;
    share?: number;
    volume?: number;
  }>;
  chart?: Array<{
    byGame?: Record<string, number>;
    end?: string;
    gains?: number;
    losses?: number;
    net?: number;
    start?: string;
    volume?: number;
  }>;
  period?: string;
  recent?: PerfEvent[];
  startedAt?: string;
  totals?: {
    events?: number;
    gains?: number;
    losses?: number;
    net?: number;
    performance?: number;
    volume?: number;
  };
};

type Leader = {
  username?: string;
  value?: number;
  credits?: number;
  points?: number;
};

type EggStatus = {
  unlocked?: boolean;
  title?: string;
  game?: string | null;
  href?: string | null;
  claimedAt?: string | null;
};

type GameKey =
  | 'SLOTS'
  | 'ROULETTE'
  | 'POKER'
  | 'BLACKJACK'
  | 'CRAPS'
  | 'PACHINKO'
  | 'HILO'
  | 'MINES'
  | 'KENO'
  | 'BACCARAT'
  | 'WHEEL'
  | 'CRASH'
  | 'CASINO';
type ChartGameKey = Exclude<GameKey, 'CASINO'>;
type ChartMode = 'overview' | 'games';
type ChartPeriod = 'day' | 'week' | 'month';
type LeaderFilter = 'credits' | 'points' | 'score';

type ChartPoint = {
  color: string;
  delta: number;
  date?: string;
  label: string;
  period?: string;
  value: number;
  x: number;
  y: number;
};

const gameMeta: Record<GameKey, { color: string; image: string; label: string; href: string }> = {
  SLOTS: {
    color: '#4193ff',
    href: '/games/slots',
    image: '/assets/home/game-slot.png',
    label: 'Machine a sous',
  },
  ROULETTE: {
    color: '#25df98',
    href: '/games/roulette',
    image: '/assets/home/game-roulette.png',
    label: 'Roulette',
  },
  POKER: {
    color: '#ff625a',
    href: '/games/poker',
    image: '/assets/home/game-poker.png',
    label: 'Poker',
  },
  BLACKJACK: {
    color: '#f7c657',
    href: '/games/blackjack',
    image: '/assets/home/game-blackjack.png',
    label: 'Blackjack',
  },
  CRAPS: {
    color: '#d8a84f',
    href: '/games/craps',
    image: '/assets/home/game-craps.png',
    label: 'Craps',
  },
  PACHINKO: {
    color: '#a58cff',
    href: '/games/pachinko',
    image: '/assets/home/game-pachinko.png',
    label: 'Pachinko',
  },
  HILO: {
    color: '#f1d28a',
    href: '/games/hi-lo',
    image: '/assets/cards/spades_A.png',
    label: 'Hi-Lo',
  },
  MINES: {
    color: '#1de59d',
    href: '/games/mines',
    image: '/assets/home/game-mines.svg',
    label: 'Mines',
  },
  KENO: {
    color: '#8ad8ff',
    href: '/games/keno',
    image: '/assets/home/game-keno.svg',
    label: 'Keno',
  },
  BACCARAT: {
    color: '#d8a84f',
    href: '/games/baccarat',
    image: '/assets/home/game-baccarat.svg',
    label: 'Baccarat',
  },
  WHEEL: {
    color: '#a58cff',
    href: '/games/wheel-of-fortune',
    image: '/assets/home/game-wheel.svg',
    label: 'Wheel of Fortune',
  },
  CRASH: {
    color: '#ff625a',
    href: '/games/crash',
    image: '/assets/home/game-crash.svg',
    label: 'Crash',
  },
  CASINO: {
    color: '#c5d0d1',
    href: '/games',
    image: '/assets/logo-the-river.png',
    label: 'Casino',
  },
};

const chartPeriodLabels: Record<ChartPeriod, string> = {
  day: '24h',
  week: '7j',
  month: '30j',
};

const chartGameKeys: ChartGameKey[] = ['SLOTS', 'ROULETTE', 'POKER', 'BLACKJACK', 'CRAPS', 'PACHINKO', 'HILO', 'MINES', 'KENO', 'BACCARAT', 'WHEEL', 'CRASH'];

function formatCredits(value: number | undefined | null) {
  return `${Number(value ?? 0).toLocaleString('fr-FR')} credits`;
}

function formatLeaderValue(value: number, filter: LeaderFilter) {
  if (filter === 'points') return `${Number(value ?? 0).toLocaleString('fr-FR')} points`;
  return formatCredits(value);
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

function formatChartRange(start?: string, end?: string) {
  if (!start || !end) return 'Periode selectionnee';
  const format = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  });
  return `${format.format(new Date(start))} - ${format.format(new Date(end))}`;
}

function toGameKey(game?: string): GameKey {
  const key = String(game ?? 'CASINO').toUpperCase();
  if (key.includes('SLOT')) return 'SLOTS';
  if (key.includes('ROULETTE')) return 'ROULETTE';
  if (key.includes('POKER')) return 'POKER';
  if (key.includes('BLACKJACK')) return 'BLACKJACK';
  if (key.includes('CRAPS')) return 'CRAPS';
  if (key.includes('PACHINKO')) return 'PACHINKO';
  if (key.includes('HILO') || key.includes('HI_LO') || key.includes('HI-LO')) return 'HILO';
  if (key.includes('MINES')) return 'MINES';
  if (key.includes('KENO')) return 'KENO';
  if (key.includes('BACCARAT')) return 'BACCARAT';
  if (key.includes('WHEEL')) return 'WHEEL';
  if (key.includes('CRASH')) return 'CRASH';
  return 'CASINO';
}

function questGoal(quest: Quest) {
  return Number(quest.goal ?? quest.target ?? 1) || 1;
}

function questProgress(quest: Quest) {
  return Math.min(Number(quest.progress ?? 0), questGoal(quest));
}

function formatCooldown(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}j ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function questCooldownInfo(quest: Quest, nowMs: number) {
  if (!quest.lastClaimedAt || !quest.nextAvailableAt) return null;

  const start = new Date(quest.lastClaimedAt).getTime();
  const end = new Date(quest.nextAvailableAt).getTime();
  const fallbackTotal = Math.max(1, Number(quest.cooldownHours ?? 0) * 3600_000);
  const total = Number.isFinite(end - start) && end > start ? end - start : fallbackTotal;
  const elapsed = Math.max(0, Math.min(total, nowMs - start));
  const remainingMs = Math.max(0, end - nowMs);
  const percent = Math.round((elapsed / total) * 100);

  return {
    label: remainingMs > 0 ? formatCooldown(remainingMs) : 'Disponible',
    percent,
    ready: remainingMs <= 0,
    remainingMs,
  };
}

function questStatus(quest: Quest, nowMs: number) {
  const cooldown = questCooldownInfo(quest, nowMs);
  const readyFromCooldown = Boolean(cooldown?.ready && questProgress(quest) >= questGoal(quest));

  if (quest.canClaim || readyFromCooldown) return { className: 'ready', label: 'Pret' };
  if (cooldown && !cooldown.ready) return { className: 'cooldown', label: 'Recharge' };
  if (quest.canClaim) return { className: 'ready', label: 'Pret' };
  if (quest.lastClaimedAt && quest.nextAvailableAt) return { className: 'cooldown', label: 'Recharge' };
  if (quest.lastClaimedAt && !quest.nextAvailableAt) return { className: 'claimed', label: 'Recupere' };
  return { className: 'progress', label: 'En cours' };
}

function pointFor(value: number, index: number, count: number, min: number, max: number, scale = 1) {
  const range = max - min || 1;
  const normalized = (value - min) / range;
  const scaled = Math.min(0.98, Math.max(0.02, (normalized - 0.5) * scale + 0.5));
  return {
    x: 32 + index * (696 / Math.max(count - 1, 1)),
    y: 300 - scaled * 240,
  };
}

function polarToCartesian(cx: number, cy: number, radius: number, angle: number) {
  const radians = ((angle - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

function describeDonutSlice(startAngle: number, endAngle: number, outerRadius = 94, innerRadius = 56) {
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  const outerStart = polarToCartesian(110, 110, outerRadius, endAngle);
  const outerEnd = polarToCartesian(110, 110, outerRadius, startAngle);
  const innerStart = polarToCartesian(110, 110, innerRadius, startAngle);
  const innerEnd = polarToCartesian(110, 110, innerRadius, endAngle);

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 0 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerStart.x} ${innerStart.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 1 ${innerEnd.x} ${innerEnd.y}`,
    'Z',
  ].join(' ');
}

function DashboardContent() {
  const { user, logout, refreshUser } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [leaders, setLeaders] = useState<Record<LeaderFilter, Leader[]>>({
    credits: [],
    points: [],
    score: [],
  });
  const [egg, setEgg] = useState<EggStatus | null>(null);
  const [claimingKey, setClaimingKey] = useState<string | null>(null);
  const [chartMode, setChartMode] = useState<ChartMode>('overview');
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('week');
  const [selectedStatsGames, setSelectedStatsGames] = useState<ChartGameKey[]>(chartGameKeys);
  const [leaderFilter, setLeaderFilter] = useState<LeaderFilter>('credits');
  const [showLeaderboard, setShowLeaderboard] = useState(true);
  const [questPanelOpen, setQuestPanelOpen] = useState(false);
  const [statsPanelOpen, setStatsPanelOpen] = useState(false);
  const [questClock, setQuestClock] = useState(() => Date.now());
  const [selectedPoint, setSelectedPoint] = useState<ChartPoint | null>(null);
  const [hoveredSlice, setHoveredSlice] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    try {
      const [summaryOut, questsOut, creditsLeadersOut, pointsLeadersOut, scoreLeadersOut, eggOut] = await Promise.all([
        apiGet<DashboardSummary>(`/dashboard/summary?period=${chartPeriod}&limit=12`).catch(() => null),
        apiGet<Quest[]>('/quests').catch(() => []),
        apiGet<Leader[]>('/dashboard/balance-leaderboard?limit=8', false).catch(() => []),
        apiGet<Leader[]>('/dashboard/leaderboard?metric=points&period=week&limit=8', false).catch(() => []),
        apiGet<Leader[]>('/dashboard/leaderboard?metric=credits&period=week&limit=8', false).catch(() => []),
        apiGet<EggStatus>('/easter-egg/status').catch(() => null),
      ]);
      setSummary(summaryOut);
      setQuests(Array.isArray(questsOut) ? questsOut : []);
      setLeaders({
        credits: Array.isArray(creditsLeadersOut) ? creditsLeadersOut : [],
        points: Array.isArray(pointsLeadersOut) ? pointsLeadersOut : [],
        score: Array.isArray(scoreLeadersOut) ? scoreLeadersOut : [],
      });
      setEgg(eggOut);
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dashboard indisponible');
    }
  }

  useEffect(() => {
    void load();
  }, [chartPeriod]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(max-width: 900px)').matches) {
      setShowLeaderboard(false);
    }
  }, []);

  useEffect(() => {
    setSelectedPoint(null);
  }, [chartMode, chartPeriod, selectedStatsGames]);

  useEffect(() => {
    if (!questPanelOpen) return;

    setQuestClock(Date.now());
    const interval = window.setInterval(() => setQuestClock(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [questPanelOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mobileLeaderboardOpen = showLeaderboard && window.matchMedia('(max-width: 900px)').matches;
    const shouldLock = questPanelOpen || statsPanelOpen || mobileLeaderboardOpen;
    if (!shouldLock) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [questPanelOpen, showLeaderboard, statsPanelOpen]);

  function toggleStatsGame(key: ChartGameKey) {
    setSelectedStatsGames((current) => {
      const next = current.includes(key)
        ? current.filter((item) => item !== key)
        : chartGameKeys.filter((item) => item === key || current.includes(item));
      return next;
    });
  }

  async function claim(key: string) {
    setClaimingKey(key);
    setError('');
    try {
      await apiPost(`/quests/${key}/claim`, {});
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recompense impossible');
    } finally {
      setClaimingKey(null);
    }
  }

  const activity = useMemo(() => {
    const recent = summary?.recent && summary.recent.length > 0 ? summary.recent : [];
    return recent.slice(0, 8);
  }, [summary]);

  const visibleActivity = useMemo(() => {
    return activity.filter((event) => selectedStatsGames.includes(toGameKey(event.game) as ChartGameKey));
  }, [activity, selectedStatsGames]);

  const chartBuckets = useMemo(() => {
    if (summary?.chart && summary.chart.length > 0) return summary.chart;

    return [...activity].reverse().map((event) => {
      const delta = Number(event.deltaCredits ?? 0);
      const game = toGameKey(event.game);
      return {
        byGame: {
          SLOTS: game === 'SLOTS' ? delta : 0,
          ROULETTE: game === 'ROULETTE' ? delta : 0,
          POKER: game === 'POKER' ? delta : 0,
          BLACKJACK: game === 'BLACKJACK' ? delta : 0,
          CRAPS: game === 'CRAPS' ? delta : 0,
          PACHINKO: game === 'PACHINKO' ? delta : 0,
          HILO: game === 'HILO' ? delta : 0,
          MINES: game === 'MINES' ? delta : 0,
          KENO: game === 'KENO' ? delta : 0,
          BACCARAT: game === 'BACCARAT' ? delta : 0,
          WHEEL: game === 'WHEEL' ? delta : 0,
          CRASH: game === 'CRASH' ? delta : 0,
        },
        end: event.createdAt,
        gains: Math.max(0, delta),
        losses: Math.abs(Math.min(0, delta)),
        net: delta,
        start: event.createdAt,
        volume: Math.abs(delta),
      };
    });
  }, [activity, summary]);

  const totals = useMemo(() => {
    if (summary?.totals) {
      return {
        gains: Number(summary.totals.gains ?? 0),
        losses: Number(summary.totals.losses ?? 0),
        net: Number(summary.totals.net ?? 0),
        performance: Number(summary.totals.performance ?? 0),
        volume: Number(summary.totals.volume ?? 0),
      };
    }

    const gains = activity
      .filter((event) => Number(event.deltaCredits ?? 0) > 0)
      .reduce((sum, event) => sum + Number(event.deltaCredits ?? 0), 0);
    const losses = Math.abs(
      activity
        .filter((event) => Number(event.deltaCredits ?? 0) < 0)
        .reduce((sum, event) => sum + Number(event.deltaCredits ?? 0), 0),
    );
    const volume = gains + losses;
    const net = gains - losses;
    const performance = volume > 0 ? (net / volume) * 100 : 0;
    return { gains, losses, net, performance, volume };
  }, [activity, summary]);

  const gameTotals = useMemo(() => {
    const map = new Map<GameKey, { gains: number; losses: number; net: number; volume: number }>();

    if (summary?.byGame) {
      for (const game of summary.byGame) {
        map.set(toGameKey(game.game), {
          gains: Number(game.gains ?? 0),
          losses: Number(game.losses ?? 0),
          net: Number(game.net ?? 0),
          volume: Number(game.volume ?? 0),
        });
      }
    } else {
      for (const event of activity) {
        const key = toGameKey(event.game);
        const delta = Number(event.deltaCredits ?? 0);
        const current = map.get(key) ?? { gains: 0, losses: 0, net: 0, volume: 0 };
        current.gains += delta > 0 ? delta : 0;
        current.losses += delta < 0 ? Math.abs(delta) : 0;
        current.net += delta;
        current.volume += Math.abs(delta);
        map.set(key, current);
      }
    }

    const ordered: GameKey[] = ['SLOTS', 'ROULETTE', 'POKER', 'BLACKJACK', 'CRAPS', 'PACHINKO', 'HILO', 'MINES', 'KENO', 'BACCARAT', 'WHEEL', 'CRASH'];
    return ordered.map((key) => ({
      key,
      ...gameMeta[key],
      ...(map.get(key) ?? { gains: 0, losses: 0, net: 0, volume: 0 }),
    }));
  }, [activity, summary]);

  const visibleGameTotals = useMemo(() => {
    return gameTotals.filter((game) => selectedStatsGames.includes(game.key as ChartGameKey));
  }, [gameTotals, selectedStatsGames]);

  const displayTotals = useMemo(() => {
    if (selectedStatsGames.length === chartGameKeys.length) return totals;
    const gains = visibleGameTotals.reduce((sum, game) => sum + Number(game.gains ?? 0), 0);
    const losses = visibleGameTotals.reduce((sum, game) => sum + Number(game.losses ?? 0), 0);
    const net = gains - losses;
    const volume = gains + losses;
    const performance = volume > 0 ? (net / volume) * 100 : 0;
    return { gains, losses, net, performance, volume };
  }, [selectedStatsGames, totals, visibleGameTotals]);

  const chartBucketsForStats = useMemo(() => {
    if (selectedStatsGames.length === chartGameKeys.length) return chartBuckets;

    return chartBuckets.map((bucket) => {
      const delta = selectedStatsGames.reduce((sum, key) => sum + Number(bucket.byGame?.[key] ?? 0), 0);
      return {
        ...bucket,
        gains: Math.max(0, delta),
        losses: Math.abs(Math.min(0, delta)),
        net: delta,
        volume: Math.abs(delta),
      };
    });
  }, [chartBuckets, selectedStatsGames]);

  const chartSeries = useMemo(() => {
    if (chartMode === 'games') {
      return selectedStatsGames.map((key) => {
        let net = 0;
        return {
          color: gameMeta[key].color,
          deltas: chartBucketsForStats.map((bucket) => Number(bucket.byGame?.[key] ?? 0)),
          key,
          label: gameMeta[key].label,
          values: chartBucketsForStats.map((bucket) => {
            net += Number(bucket.byGame?.[key] ?? 0);
            return net;
          }),
        };
      });
    }

    let cumulativeNet = 0;
    return [
      {
        color: '#4193ff',
        deltas: chartBucketsForStats.map((bucket) => Number(bucket.net ?? 0)),
        key: 'net',
        label: 'Net',
        values: chartBucketsForStats.map((bucket) => {
          cumulativeNet += Number(bucket.net ?? 0);
          return cumulativeNet;
        }),
      },
      {
        color: '#25df98',
        deltas: chartBucketsForStats.map((bucket) => Number(bucket.gains ?? 0)),
        key: 'gains',
        label: 'Gains',
        values: chartBucketsForStats.map((bucket) => Number(bucket.gains ?? 0)),
      },
      {
        color: '#ff625a',
        deltas: chartBucketsForStats.map((bucket) => -Number(bucket.losses ?? 0)),
        key: 'losses',
        label: 'Pertes',
        values: chartBucketsForStats.map((bucket) => Number(bucket.losses ?? 0)),
      },
    ];
  }, [chartBucketsForStats, chartMode, selectedStatsGames]);

  const chartBounds = useMemo(() => {
    const values = chartSeries.flatMap((series) => series.values);
    return {
      max: Math.max(...values, 1),
      min: Math.min(...values, 0),
    };
  }, [chartSeries]);

  const pieSlices = useMemo(() => {
    return visibleGameTotals
      .filter((game) => game.volume > 0)
      .sort((a, b) => b.volume - a.volume)
      .map((game) => ({
        color: game.color,
        image: game.image,
        key: game.key,
        label: game.label,
        meta: `${formatCredits(game.net)} net`,
        value: game.volume,
      }));
  }, [visibleGameTotals]);

  const pieTotal = pieSlices.reduce((sum, slice) => sum + slice.value, 0);
  const hasPieData = pieTotal > 0;
  let sliceCursor = 0;
  const selectedStatsCount = selectedStatsGames.length;

  const claimableQuests = quests.filter((quest) => quest.canClaim);
  const leaderRows = useMemo(() => {
    return [...leaders[leaderFilter]]
      .map((leader) => ({
        label: leader.username ?? 'Joueur',
        value:
          leaderFilter === 'credits'
            ? Number(leader.credits ?? leader.value ?? 0)
            : leaderFilter === 'points'
              ? Number(leader.points ?? leader.value ?? 0)
              : Number(leader.value ?? leader.credits ?? leader.points ?? 0),
      }))
      .sort((a, b) => b.value - a.value);
  }, [leaderFilter, leaders]);

  function selectChartPoint(
    series: { color: string; deltas: number[]; key: string; label: string; values: number[] },
    index: number,
    point: { x: number; y: number },
  ) {
    const bucket = chartBucketsForStats[index];
    const pointDelta = Number(series.deltas[index] ?? 0);
    setSelectedPoint({
      color: series.color,
      date: bucket?.start,
      delta: pointDelta,
      label: series.label,
      period: formatChartRange(bucket?.start, bucket?.end),
      value: series.values[index],
      x: point.x,
      y: point.y,
    });
  }

  return (
    <section className={showLeaderboard ? 'dashboard-shell dashboard-modern' : 'dashboard-shell dashboard-modern leaderboard-hidden'}>
      <div className="dashboard-main">
        <header className="dashboard-header">
          <div>
            <h1>Bonjour, {user?.username ?? 'joueur'} !</h1>
            <p>Vue claire de tes credits, resultats et objectifs actifs.</p>
          </div>
          <div className="dashboard-actions">
            <button className="button secondary small dashboard-action-button quest-open-button" onClick={() => setQuestPanelOpen(true)} type="button">
              <ListChecks size={17} />
              <span>Quetes</span>
              {claimableQuests.length > 0 ? <strong>{claimableQuests.length}</strong> : null}
            </button>
            <button className="button secondary small dashboard-action-button stats-filter-button" onClick={() => setStatsPanelOpen(true)} type="button">
              <SlidersHorizontal size={17} />
              <span>Filtres</span>
              <strong>{selectedStatsCount}/{chartGameKeys.length}</strong>
            </button>
            {egg?.unlocked ? (
              <Link className="button secondary small dashboard-action-button secret-salon-link" href="/easter-egg">
                <Sparkles size={17} />
                <span>Salon du Dragon</span>
              </Link>
            ) : null}
            <button className="button secondary small dashboard-action-button" onClick={() => setShowLeaderboard((value) => !value)} type="button">
              <Trophy size={17} />
              <span>Classement</span>
            </button>
            <button className="icon-button" type="button" title="Notifications">
              <Bell size={18} />
            </button>
          </div>
        </header>

        {error ? <StatusMessage type="error">{error}</StatusMessage> : null}

        <div className="dashboard-kpis">
          <article className="metric-card accent">
            <span>Volume joue</span>
            <strong>{formatCredits(displayTotals.volume)}</strong>
            <em>Periode selectionnee</em>
          </article>
          <article className="metric-card">
            <span>Gains</span>
            <strong>{formatCredits(displayTotals.gains)}</strong>
            <em className="positive">Credits positifs</em>
          </article>
          <article className="metric-card">
            <span>Pertes</span>
            <strong>{formatCredits(displayTotals.losses)}</strong>
            <em className="negative">Credits negatifs</em>
          </article>
          <article className="metric-card">
            <span>Performance nette</span>
            <strong>{displayTotals.performance.toFixed(1)}%</strong>
            <em className={displayTotals.net >= 0 ? 'positive' : 'negative'}>{formatCredits(displayTotals.net)} net</em>
          </article>
        </div>

        <section className="analytics-card chart-card interactive-card">
          <div className="card-heading">
            <h2>Evolution des performances</h2>
            <div className="chart-controls">
              <div className="segmented-control">
                {(Object.keys(chartPeriodLabels) as ChartPeriod[]).map((period) => (
                  <button className={chartPeriod === period ? 'active' : ''} key={period} onClick={() => setChartPeriod(period)} type="button">
                    {chartPeriodLabels[period]}
                  </button>
                ))}
              </div>
              <div className="segmented-control">
                <button className={chartMode === 'overview' ? 'active' : ''} onClick={() => setChartMode('overview')} type="button">
                  Net
                </button>
                <button className={chartMode === 'games' ? 'active' : ''} onClick={() => setChartMode('games')} type="button">
                  Par jeu
                </button>
              </div>
            </div>
          </div>
          <div className="chart-wrap">
            <svg className="performance-chart" viewBox="0 0 760 340" role="img" aria-label="Evolution des performances">
              {[60, 120, 180, 240, 300].map((y) => (
                <line className="chart-grid-line" x1="20" x2="740" y1={y} y2={y} key={y} />
              ))}
              {chartSeries.map((series) => {
                const curveScale = chartMode === 'games' ? 1.28 : 1.55;
                const points = series.values.map((value, index) => pointFor(value, index, series.values.length, chartBounds.min, chartBounds.max, curveScale));
                return (
                  <g key={series.label}>
                    <polyline
                      className="chart-line"
                      points={points.map((point) => `${point.x},${point.y}`).join(' ')}
                      style={{ stroke: series.color }}
                    />
                    {points.map((point, index) => (
                      <g
                        aria-label={`${series.label}: ${formatCredits(series.values[index])}`}
                        className="chart-point-button"
                        key={`${series.label}-${index}`}
                        onClick={() => selectChartPoint(series, index, point)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            selectChartPoint(series, index, point);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <circle
                          className="chart-point"
                          cx={point.x}
                          cy={point.y}
                          r={selectedPoint?.label === series.label && selectedPoint.value === series.values[index] ? 7 : 5}
                          style={{ fill: series.color }}
                        />
                      </g>
                    ))}
                  </g>
                );
              })}
            </svg>
            {selectedPoint ? (
              <div className="chart-tooltip" style={{ left: `${(selectedPoint.x / 760) * 100}%`, top: `${(selectedPoint.y / 340) * 100}%` }}>
                <span style={{ color: selectedPoint.color }}>{selectedPoint.label}</span>
                <strong className={selectedPoint.value >= 0 && selectedPoint.label !== 'Pertes' ? 'positive' : 'negative'}>
                  {selectedPoint.value >= 0 && selectedPoint.label !== 'Pertes' ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
                  {formatCredits(selectedPoint.value)}
                </strong>
                <em className={selectedPoint.delta >= 0 ? 'positive' : 'negative'}>
                  Variation: {selectedPoint.delta >= 0 ? '+' : ''}{formatCredits(selectedPoint.delta)}
                </em>
                <small>{selectedPoint.period ?? formatDate(selectedPoint.date)}</small>
              </div>
            ) : null}
          </div>
          <div className="legend">
            {chartSeries.map((series) => (
              <span key={series.label}><i style={{ background: series.color }} /> {series.label}</span>
            ))}
          </div>
        </section>

        <div className="dashboard-grid compact">
          <section className="analytics-card distribution-card interactive-card">
            <div className="card-heading">
              <div>
                <h2>Repartition par jeu</h2>
                <span className="card-subtitle">Basee sur les jeux selectionnes</span>
              </div>
            </div>
            <div className="distribution-layout">
              <div className="donut-frame">
                <svg className="donut-svg" viewBox="0 0 220 220" role="img" aria-label="Repartition">
                  <filter id="sliceGlow" x="-45%" y="-45%" width="190%" height="190%">
                    <feDropShadow dx="0" dy="0" stdDeviation="7" floodColor="#f1d28a" floodOpacity="0.95" />
                  </filter>
                  {hasPieData ? pieSlices.map((slice) => {
                    const start = (sliceCursor / pieTotal) * 360;
                    sliceCursor += slice.value;
                    const end = (sliceCursor / pieTotal) * 360;
                    return (
                      <path
                        className="donut-slice"
                        d={describeDonutSlice(start, end)}
                        fill={slice.color}
                        filter={hoveredSlice === slice.key ? 'url(#sliceGlow)' : undefined}
                        key={slice.key}
                        onMouseEnter={() => setHoveredSlice(slice.key)}
                        onMouseLeave={() => setHoveredSlice(null)}
                      />
                    );
                  }) : <circle cx="110" cy="110" r="94" fill="none" stroke="rgba(150, 174, 190, 0.18)" strokeWidth="38" />}
                  <circle cx="110" cy="110" r="51" fill="#08151c" />
                  <text className="donut-center-label" x="110" y="105" textAnchor="middle">Total</text>
                  <text className="donut-center-value" x="110" y="128" textAnchor="middle">
                    {formatCredits(displayTotals.volume)}
                  </text>
                </svg>
              </div>
              <div className="distribution-list">
                {pieSlices.length > 0 ? pieSlices.map((slice) => {
                  const percent = hasPieData ? Math.round((slice.value / pieTotal) * 100) : 0;
                  return (
                    <div className={hoveredSlice === slice.key ? 'distribution-item active' : 'distribution-item'} key={slice.key}>
                      <span className="distribution-game">
                        {'image' in slice && slice.image ? <Image src={slice.image} alt="" width={42} height={34} /> : <i style={{ background: slice.color }} />}
                        <span>
                          <strong>{slice.label}</strong>
                          <em>{slice.meta}</em>
                        </span>
                      </span>
                      <strong>{percent}%</strong>
                      <span className="distribution-bar">
                        <span style={{ background: slice.color, width: `${percent}%` }} />
                      </span>
                    </div>
                  );
                }) : <div className="activity-empty">Aucune donnee sur cette selection.</div>}
              </div>
            </div>
          </section>

          <section className="analytics-card activity-card-panel interactive-card">
            <div className="card-heading">
              <div>
                <h2>Activite recente</h2>
                <span className="card-subtitle">Dernieres actions des jeux selectionnes</span>
              </div>
              <Link href="/games">Voir tous les jeux</Link>
            </div>
            <div className="activity-card-list">
              {visibleActivity.length > 0 ? visibleActivity.slice(0, 8).map((event, index) => {
                const delta = Number(event.deltaCredits ?? 0);
                const meta = gameMeta[toGameKey(event.game)];
                return (
                  <article className="activity-card" key={`${event.game}-${event.createdAt}-${index}`}>
                    <Image src={meta.image} alt="" width={46} height={38} />
                    <div>
                      <strong>{meta.label}</strong>
                      <span>{formatDate(event.createdAt)}</span>
                    </div>
                    <em className={delta >= 0 ? 'positive' : 'negative'}>
                      {delta >= 0 ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
                      {delta >= 0 ? '+' : ''}{formatCredits(delta)}
                    </em>
                  </article>
                );
              }) : <div className="activity-empty">Aucune activite recente pour le moment.</div>}
            </div>
          </section>
        </div>
      </div>

      {showLeaderboard ? <button className="drawer-backdrop dashboard-leaderboard-backdrop" onClick={() => setShowLeaderboard(false)} type="button" aria-label="Fermer le classement" /> : null}
      {showLeaderboard ? (
        <aside className="dashboard-panel">
          <div className="panel-heading">
            <div>
              <h2>Leaderboard</h2>
              <p>Classement rapide des joueurs.</p>
            </div>
            <button className="icon-button" onClick={() => setShowLeaderboard(false)} type="button" title="Masquer">
              <X size={17} />
            </button>
          </div>
          <div className="segmented-control full">
            <button className={leaderFilter === 'credits' ? 'active' : ''} onClick={() => setLeaderFilter('credits')} type="button">
              Credits
            </button>
            <button className={leaderFilter === 'points' ? 'active' : ''} onClick={() => setLeaderFilter('points')} type="button">
              Points
            </button>
            <button className={leaderFilter === 'score' ? 'active' : ''} onClick={() => setLeaderFilter('score')} type="button">
              Score
            </button>
          </div>
          <div className="leader-list">
            {leaderRows.length > 0 ? (
              leaderRows.map((leader, index) => (
                <div className="leader-row" key={`${leader.label}-${index}`}>
                  <span>#{index + 1}</span>
                  <strong>{leader.label}</strong>
                  <em>{formatLeaderValue(leader.value, leaderFilter)}</em>
                </div>
              ))
            ) : (
              <div className="panel-empty">Aucun classement disponible.</div>
            )}
          </div>
          <div className="sidebar-balance">
            <span>Solde total</span>
            <strong>{formatCredits(summary?.balance ?? user?.credits)}</strong>
            <Link href="/games">Jouer maintenant <ChevronRight size={14} /></Link>
          </div>
          <button className="button secondary small" onClick={logout} type="button">
            Deconnexion
          </button>
        </aside>
      ) : null}

      {statsPanelOpen ? <button className="drawer-backdrop" onClick={() => setStatsPanelOpen(false)} type="button" aria-label="Fermer les filtres" /> : null}
      {questPanelOpen ? <button className="drawer-backdrop" onClick={() => setQuestPanelOpen(false)} type="button" aria-label="Fermer les quetes" /> : null}
      <aside className={statsPanelOpen ? 'stats-filter-card stats-filter-drawer open' : 'stats-filter-card stats-filter-drawer'} aria-hidden={!statsPanelOpen}>
        <div className="stats-filter-heading">
          <div>
            <span>Stats par jeux</span>
            <strong>{selectedStatsCount}/{chartGameKeys.length} actifs</strong>
          </div>
          <button className="icon-button" onClick={() => setStatsPanelOpen(false)} type="button" title="Fermer">
            <X size={18} />
          </button>
        </div>
        <div className="stats-filter-actions">
          <button onClick={() => setSelectedStatsGames(chartGameKeys)} type="button">
            Tous
          </button>
          <button onClick={() => setSelectedStatsGames([])} type="button">
            Effacer
          </button>
        </div>
        <div className="stats-filter-grid">
          {chartGameKeys.map((key) => {
            const checked = selectedStatsGames.includes(key);
            return (
              <label className={checked ? 'stats-chip active' : 'stats-chip'} key={key}>
                <input checked={checked} onChange={() => toggleStatsGame(key)} type="checkbox" />
                <i style={{ background: gameMeta[key].color }} />
                <span>{gameMeta[key].label}</span>
                {checked ? <Check size={15} /> : null}
              </label>
            );
          })}
        </div>
      </aside>
      <aside className={questPanelOpen ? 'quest-drawer open' : 'quest-drawer'} aria-hidden={!questPanelOpen}>
        <div className="panel-heading">
          <div>
            <h2>Quetes</h2>
            <p>{claimableQuests.length} recompense(s) a recuperer.</p>
          </div>
          <button className="icon-button" onClick={() => setQuestPanelOpen(false)} type="button" title="Fermer">
            <X size={18} />
          </button>
        </div>
        <div className="quest-drawer-list">
          {quests.length > 0 ? (
            quests.map((quest) => {
              const goal = questGoal(quest);
              const progress = questProgress(quest);
              const cooldown = questCooldownInfo(quest, questClock);
              const canClaimNow = Boolean(quest.canClaim || (cooldown?.ready && progress >= goal));
              const status = questStatus(quest, questClock);
              const percent = Math.round((progress / goal) * 100);
              return (
                <article className="quest-mini-card interactive-card" key={quest.key}>
                  <div className="quest-topline">
                    <Target size={18} />
                    <span className={`quest-status ${status.className}`}>{status.label}</span>
                  </div>
                  <h3>{quest.title ?? quest.label ?? quest.key}</h3>
                  <p>{quest.description ?? 'Objectif en cours.'}</p>
                  <div className="quest-progress" aria-label={`${percent}%`}>
                    <span style={{ width: `${percent}%` }} />
                  </div>
                  {cooldown && !quest.canClaim ? (
                    <div className={cooldown.ready ? 'quest-cooldown ready' : 'quest-cooldown'}>
                      <div className="quest-cooldown-meta">
                        <span>{cooldown.ready ? 'Recharge terminee' : 'Recharge dans'}</span>
                        <strong>{cooldown.label}</strong>
                      </div>
                      <div className="quest-cooldown-bar" aria-label={`Recharge ${cooldown.percent}%`}>
                        <span style={{ width: `${cooldown.percent}%` }} />
                      </div>
                    </div>
                  ) : null}
                  <div className="quest-footer">
                    <span>{progress}/{goal}</span>
                    <strong>+{formatCredits(quest.rewardCredits ?? 0)}</strong>
                  </div>
                  {canClaimNow ? (
                    <button className="button small" disabled={claimingKey === quest.key} onClick={() => void claim(quest.key)} type="button">
                      {claimingKey === quest.key ? 'Recuperation...' : 'Recuperer'}
                    </button>
                  ) : null}
                </article>
              );
            })
          ) : (
            <article className="quest-mini-card">
              <Target size={18} />
              <h3>Aucun objectif charge</h3>
              <p>Les quetes apparaitront ici des que le backend repondra.</p>
            </article>
          )}
        </div>
      </aside>
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
