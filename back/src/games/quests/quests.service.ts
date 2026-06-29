import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';

import { UsersService } from '../../users/users.service';
import { UserEntity } from '../../users/entities/user.entity';
import { GameEventEntity } from '../stats/entities/game-event.entity';
import { UserQuestStateEntity } from './entities/user-quest-state.entity';

type GameKey = 'POKER' | 'BLACKJACK' | 'ROULETTE' | 'SLOTS';

type QuestKind =
  | 'LOGIN'
  | 'PLAY_ANY' // jouer 1 partie/round n’importe quel jeu
  | 'PLAY_GAME' // jouer 1 partie/round d’un jeu spécifique
  | 'PLAY_DIFFERENT_GAMES' // jouer à N jeux différents (au moins 1 event chacun)
  | 'PLAY_N_TOTAL' // jouer N rounds au total (tous jeux)
  | 'PLAY_N_SAME_GAME' // jouer N rounds dans le même jeu (n’importe lequel)
  | 'PLAY_N_IN_GAME' // jouer N rounds dans un jeu spécifique
  | 'WIN_N_IN_GAME' // gagner N rounds (deltaCredits > 0) dans un jeu spécifique
  | 'POKER_WIN_HAND' // gagner 1 main (deltaCredits > 0) au poker
  | 'GAIN_POINTS' // gagner X points (somme deltaPoints)
  | 'GAIN_POINTS_SERIES_TABLES' // gagner des points sur X tables différe
  | 'EASTER_EGG_KEYS' // quête secrète : débloquer 4 clés (et valider via page)
  | 'SURVIVOR_PLAY' // condition credits <= threshold, puis jouer N rounds
  | 'COMEBACK_TO_CREDITS' // condition: balanceAfter==0 dans les 24h ou credits==0, objectif atteindre >= targetCredits
  // ✅ AJOUTS (nouveaux kinds)
  | 'ROULETTE_WIN_ZERO'
  | 'BLACKJACK_WIN_NO_HIT'
  | 'POKER_WIN_FLUSH_PLUS'
  // ✅ AJOUTS (quêtes demandées)
  | 'SECRET_FIRST_STEPS'
  | 'SLOTS_TRIPLE_JACKPOT';

type QuestDef = {
  key: string;
  title: string;
  description: string;

  cooldownHours: number;
  rewardCredits: number;

  kind: QuestKind;

  // options
  game?: GameKey;
  goal?: number;
  minBet?: number;
  creditsMax?: number;
  targetCredits?: number;
};

type QuestView = {
  key: string;
  title: string;
  description: string;
  cooldownHours: number;
  rewardCredits: number;

  progress: number;
  goal: number;

  canClaim: boolean;
  nextAvailableAt: string | null;
  lastClaimedAt: string | null;
};

type ProgressResult = {
  progress: number;
  goal: number;
  complete: boolean;
  // pour "Premiers pas"
  impossible?: boolean;
};

@Injectable()
export class QuestsService {
  constructor(
    @InjectRepository(UserQuestStateEntity)
    private readonly questRepo: Repository<UserQuestStateEntity>,

    @InjectRepository(GameEventEntity)
    private readonly eventsRepo: Repository<GameEventEntity>,

    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,

    private readonly usersService: UsersService,
  ) {}

  // ✅ Toutes les quêtes de ta liste
  private readonly quests: QuestDef[] = [
    // -------------------- DAILY (24h) --------------------
    {
      key: 'daily_login',
      title: 'Connexion quotidienne',
      description: 'Connecte-toi (1 fois toutes les 24h).',
      cooldownHours: 24,
      rewardCredits: 50,
      kind: 'LOGIN',
    },
    {
      key: 'daily_play_any_1',
      title: 'Jouer 1 partie (n’importe quel jeu)',
      description:
        'Termine 1 round/partie (roulette spin / slot spin / blackjack round / poker hand).',
      cooldownHours: 24,
      rewardCredits: 40,
      kind: 'PLAY_ANY',
    },
    {
      key: 'daily_explore_2_games',
      title: 'Explorer les jeux',
      description: 'Joue 1 fois à 2 jeux différents (ex: roulette + slots).',
      cooldownHours: 24,
      rewardCredits: 80,
      kind: 'PLAY_DIFFERENT_GAMES',
      goal: 2,
    },
    {
      key: 'daily_play_3_same_game_min5',
      title: 'Jouer 3 fois au même jeu',
      description: 'Fais 3 rounds dans le même jeu (min bet ≥ 5).',
      cooldownHours: 24,
      rewardCredits: 60,
      kind: 'PLAY_N_SAME_GAME',
      goal: 3,
      minBet: 5,
    },

    // -------------------- RECHARGE (6h–12h) --------------------
    {
      key: 'rescue_slots_1_min2',
      title: 'Un spin de secours (Slots)',
      description: 'Fais 1 spin slots (min bet ≥ 2).',
      cooldownHours: 6,
      rewardCredits: 15,
      kind: 'PLAY_GAME',
      game: 'SLOTS',
      minBet: 2,
    },
    {
      key: 'rescue_roulette_1_min2',
      title: 'Mise de secours (Roulette)',
      description: 'Fais 1 spin roulette (min bet ≥ 2).',
      cooldownHours: 6,
      rewardCredits: 15,
      kind: 'PLAY_GAME',
      game: 'ROULETTE',
      minBet: 2,
    },
    {
      key: 'rescue_blackjack_1_min2',
      title: 'Main de secours (Blackjack)',
      description: 'Termine 1 round blackjack (min bet ≥ 2).',
      cooldownHours: 8,
      rewardCredits: 20,
      kind: 'PLAY_GAME',
      game: 'BLACKJACK',
      minBet: 2,
    },

    // -------------------- SECRET (1 fois par compte) --------------------
    {
      key: 'secret_easter_egg',
      title: '???',
      description: 'Une présence étrange rôde dans le casino… Trouve 4 indices (0/4).',
      cooldownHours: 0, // pas de cooldown (mais claimable 1 seule fois)
      rewardCredits: 5000,
      kind: 'EASTER_EGG_KEYS',
      goal: 4,
    },

    // -------------------- ✅ NOUVELLES QUÊTES (A/B/C) --------------------
    {
      key: 'roulette_win_zero',
      title: 'Coup du zéro',
      description: 'Gagne une mise sur le 0 à la roulette.',
      cooldownHours: 48,
      rewardCredits: 250,
      kind: 'ROULETTE_WIN_ZERO',
      game: 'ROULETTE',
      goal: 1,
    },
    {
      key: 'blackjack_win_no_hit',
      title: 'Sans trembler',
      description: 'Gagne un round de blackjack sans tirer de carte (stand direct).',
      cooldownHours: 24,
      rewardCredits: 180,
      kind: 'BLACKJACK_WIN_NO_HIT',
      game: 'BLACKJACK',
      goal: 1,
    },
    {
      key: 'poker_win_flush_plus',
      title: 'Main premium',
      description: 'Gagne un pot avec une couleur ou mieux.',
      cooldownHours: 72,
      rewardCredits: 500,
      kind: 'POKER_WIN_FLUSH_PLUS',
      game: 'POKER',
      goal: 1,
    },

    // -------------------- ✅ Quête secrète “Premiers pas” (1 fois / compte) --------------------
    {
      key: 'secret_first_steps',
      title: '???',
      description: 'Un défi unique… Remporte ta toute première partie sur chaque jeu (0/4).',
      cooldownHours: 0, // 1 seule fois / compte (géré comme EASTER_EGG)
      rewardCredits: 3000,
      kind: 'SECRET_FIRST_STEPS',
      goal: 4,
    },

    // -------------------- ✅ Triple Jackpot (15 jours) --------------------
    {
      key: 'slots_triple_jackpot',
      title: 'Triple Jackpot',
      description: 'Fais un jackpot sur SLOT_3X3, SLOT_3X5 et SLOT_5X5.',
      cooldownHours: 24 * 15,
      rewardCredits: 2000,
      kind: 'SLOTS_TRIPLE_JACKPOT',
      game: 'SLOTS',
      goal: 3,
    },

    // -------------------- WEEKLY (7 jours) --------------------
    {
      key: 'weekly_play_20_total_min5',
      title: 'Joueur régulier',
      description: 'Joue 20 rounds au total (tous jeux) (min bet ≥ 5).',
      cooldownHours: 24 * 7,
      rewardCredits: 250,
      kind: 'PLAY_N_TOTAL',
      goal: 20,
      minBet: 5,
    },
    {
      key: 'weekly_slots_30_min5',
      title: 'Spécialiste Slots',
      description: 'Fais 30 spins slots (min bet ≥ 5).',
      cooldownHours: 24 * 7,
      rewardCredits: 200,
      kind: 'PLAY_N_IN_GAME',
      game: 'SLOTS',
      goal: 30,
      minBet: 5,
    },
    {
      key: 'weekly_roulette_20_min5',
      title: 'Spécialiste Roulette',
      description: 'Fais 20 spins roulette (min bet ≥ 5).',
      cooldownHours: 24 * 7,
      rewardCredits: 200,
      kind: 'PLAY_N_IN_GAME',
      game: 'ROULETTE',
      goal: 20,
      minBet: 5,
    },
    {
      key: 'weekly_blackjack_win_3_min5',
      title: 'Spécialiste Blackjack',
      description: 'Gagne 3 rounds blackjack (min bet ≥ 5).',
      cooldownHours: 24 * 7,
      rewardCredits: 250,
      kind: 'WIN_N_IN_GAME',
      game: 'BLACKJACK',
      goal: 3,
      minBet: 5,
    },

    // -------------------- POKER (avec / sans comp) --------------------
    {
      key: 'daily_poker_play_1',
      title: 'Poker : jouer une main',
      description: 'Participe à 1 main de poker (être seated + main terminée).',
      cooldownHours: 24,
      rewardCredits: 40,
      kind: 'PLAY_GAME',
      game: 'POKER',
    },
    {
      key: 'daily_poker_win_1',
      title: 'Poker : gagner une main',
      description: 'Gagne 1 main de poker (pot win).',
      cooldownHours: 24,
      rewardCredits: 120,
      kind: 'POKER_WIN_HAND',
    },

    // Comp points (+20) et variante (+10)
    {
      key: 'daily_comp_points_20',
      title: 'Compétition : gagner des points (+20)',
      description: 'Gagne au moins +20 points en poker compétition.',
      cooldownHours: 24,
      rewardCredits: 150,
      kind: 'GAIN_POINTS',
      game: 'POKER',
      goal: 20,
    },
    {
      key: 'daily_comp_points_10',
      title: 'Compétition : gagner des points (+10)',
      description: 'Gagne au moins +10 points en poker compétition.',
      cooldownHours: 24,
      rewardCredits: 80,
      kind: 'GAIN_POINTS',
      game: 'POKER',
      goal: 10,
    },

    {
      key: 'weekly_comp_series_3_tables',
      title: 'Compétition : série',
      description: 'Gagne des points sur 3 tables différentes / 3 parties.',
      cooldownHours: 24 * 7,
      rewardCredits: 400,
      kind: 'GAIN_POINTS_SERIES_TABLES',
      game: 'POKER',
      goal: 3,
    },

    // -------------------- ANTI-TILT --------------------
    {
      key: 'survivor_play_5_min2',
      title: 'Retour du survivant',
      description: 'Condition: crédits ≤ 20. Joue 5 rounds (min bet ≥ 2).',
      cooldownHours: 48,
      rewardCredits: 200,
      kind: 'SURVIVOR_PLAY',
      goal: 5,
      minBet: 2,
      creditsMax: 20,
    },
    {
      key: 'comeback_to_100',
      title: 'Comeback',
      description:
        'Condition: avoir été à 0 crédits dans les 24h. Objectif: remonter à ≥ 100 crédits.',
      cooldownHours: 24 * 7,
      rewardCredits: 300,
      kind: 'COMEBACK_TO_CREDITS',
      targetCredits: 100,
    },
  ];

  private now() {
    return new Date();
  }

  private addHours(d: Date, hours: number) {
    return new Date(d.getTime() + hours * 3600_000);
  }

  private clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
  }

  private safeJsonParse(s: any): any | null {
    if (!s) return null;
    try {
      if (typeof s === 'string') return JSON.parse(s);
      return s;
    } catch {
      return null;
    }
  }

  private extractBet(meta: any): number {
    if (!meta) return 0;

    const candidates = [
      meta.bet,
      meta.betAmount,
      meta.amount,
      meta.wager,
      meta.stake,
      meta.totalBet,
      meta.totalWager,
      meta.totalAmount,
      meta.creditsBet,
    ];

    for (const c of candidates) {
      const n = Number(c);
      if (Number.isFinite(n) && n > 0) return n;
    }

    if (meta.payload) return this.extractBet(meta.payload);
    if (meta.request) return this.extractBet(meta.request);

    return 0;
  }

  private extractTableCode(meta: any): string | null {
    if (!meta) return null;
    const c =
      meta.tableCode ??
      meta.tableId ??
      meta.code ??
      meta.table ??
      (meta.payload ? meta.payload.tableCode ?? meta.payload.tableId : null);
    if (typeof c === 'string' && c.trim()) return c.trim();
    if (typeof c === 'number' && Number.isFinite(c)) return String(c);
    return null;
  }

  private extractBalanceAfter(meta: any): number | null {
    if (!meta) return null;
    const c =
      meta.balanceAfter ??
      meta.creditsAfter ??
      meta.afterCredits ??
      (meta.payload ? meta.payload.balanceAfter ?? meta.payload.creditsAfter : null);
    const n = Number(c);
    return Number.isFinite(n) ? n : null;
  }

  private async getUserById(userId: number): Promise<UserEntity | null> {
    return this.usersRepo.findOne({ where: { userId } as any });
  }

  private async getState(userId: number, questKey: string): Promise<UserQuestStateEntity> {
    let s = await this.questRepo.findOne({ where: { userId, questKey } as any });
    if (!s) {
      s = this.questRepo.create({ userId, questKey, lastClaimedAt: null });
      s = await this.questRepo.save(s);
    }
    return s;
  }

  private computeNextAvailableAt(lastClaimedAt: Date | null, cooldownHours: number): Date | null {
    if (!lastClaimedAt) return null;
    return this.addHours(lastClaimedAt, cooldownHours);
  }

  private isCooldownReady(lastClaimedAt: Date | null, cooldownHours: number): boolean {
    const next = this.computeNextAvailableAt(lastClaimedAt, cooldownHours);
    if (!next) return true;
    return this.now().getTime() >= next.getTime();
  }

  private async fetchEvents(userId: number, since: Date | null, take = 800, game?: GameKey) {
    const sinceDate = since ?? new Date(0);
    const where: any = {
      userId,
      createdAt: MoreThan(sinceDate as any),
    };
    if (game) where.game = game;

    return this.eventsRepo.find({
      where,
      order: { createdAt: 'DESC' },
      take,
    });
  }

  private async fetchEventsAscAllTime(userId: number, take = 8000, game?: GameKey) {
    const where: any = { userId };
    if (game) where.game = game;

    return this.eventsRepo.find({
      where,
      order: { createdAt: 'ASC' },
      take,
    });
  }

  private filterByMinBet(rows: any[], minBet?: number) {
    const mb = Number(minBet || 0);
    if (!mb) return rows;

    return rows.filter((e) => {
      const meta =
        this.safeJsonParse((e as any).metaJson) ?? this.safeJsonParse((e as any).meta) ?? null;
      const bet = this.extractBet(meta);
      return bet >= mb;
    });
  }

  private countWins(rows: any[]) {
    return rows.filter((e) => Number(e.deltaCredits || 0) > 0).length;
  }

  private sumPoints(rows: any[]) {
    return rows.reduce((s, e) => s + Number(e.deltaPoints || 0), 0);
  }

  // ✅ Poker rank mapping (robuste aux formats)
  private pokerRankValue(rank: any): number {
    if (rank === null || rank === undefined) return -1;

    // numeric already
    if (typeof rank === 'number' && Number.isFinite(rank)) return rank;

    const s = String(rank).toUpperCase().trim();

    // common labels
    const map: Record<string, number> = {
      HIGH_CARD: 0,
      HIGHCARD: 0,
      PAIR: 1,
      ONE_PAIR: 1,
      TWOPAIR: 2,
      TWO_PAIR: 2,
      TRIPS: 3,
      THREE_OF_A_KIND: 3,
      SET: 3,
      STRAIGHT: 4,
      FLUSH: 5,
      FULL_HOUSE: 6,
      FULLHOUSE: 6,
      QUADS: 7,
      FOUR_OF_A_KIND: 7,
      STRAIGHT_FLUSH: 8,
      STRAIGHTFLUSH: 8,
      ROYAL_FLUSH: 9,
      ROYALFLUSH: 9,
    };

    if (map[s] !== undefined) return map[s];

    // sometimes "HandRank.FLUSH" etc.
    const parts = s.split('.').filter(Boolean);
    const last = parts[parts.length - 1] ?? s;
    if (map[last] !== undefined) return map[last];

    return -1;
  }

  // ✅ slots machine id parsing (robuste)
  private normalizeSlotMachine(meta: any): 'SLOT_3X3' | 'SLOT_3X5' | 'SLOT_5X5' | null {
    if (!meta) return null;

    const raw =
      meta.machine ??
      meta.machineId ??
      meta.slotMachine ??
      meta.slotType ??
      meta.mode ??
      meta.grid ??
      meta.layout ??
      meta.size ??
      meta.kind ??
      meta.variant ??
      (meta.payload ? meta.payload.machine ?? meta.payload.machineId ?? meta.payload.slotType : null);

    // direct string
    if (typeof raw === 'string') {
      const s = raw.toUpperCase().replace(/\s+/g, '').replace(/-/g, '_');
      if (s.includes('SLOT_3X3') || s === '3X3' || s.includes('3X3')) return 'SLOT_3X3';
      if (s.includes('SLOT_3X5') || s === '3X5' || s.includes('3X5')) return 'SLOT_3X5';
      if (s.includes('SLOT_5X5') || s === '5X5' || s.includes('5X5')) return 'SLOT_5X5';
    }

    // object {rows, cols}
    if (raw && typeof raw === 'object') {
      const rows = Number((raw as any).rows ?? (raw as any).r ?? (raw as any).height ?? (raw as any).y);
      const cols = Number((raw as any).cols ?? (raw as any).c ?? (raw as any).width ?? (raw as any).x);
      if (rows === 3 && cols === 3) return 'SLOT_3X3';
      if (rows === 3 && cols === 5) return 'SLOT_3X5';
      if (rows === 5 && cols === 5) return 'SLOT_5X5';
    }

    // fallback: meta itself might have rows/cols
    const rows = Number(meta.rows ?? meta.r ?? meta.height);
    const cols = Number(meta.cols ?? meta.c ?? meta.width);
    if (rows === 3 && cols === 3) return 'SLOT_3X3';
    if (rows === 3 && cols === 5) return 'SLOT_3X5';
    if (rows === 5 && cols === 5) return 'SLOT_5X5';

    return null;
  }

  private isJackpotEvent(e: any, meta: any): boolean {
    // idéal: meta.jackpot / meta.isJackpot / meta.hitJackpot / meta.jackpotWin
    if (meta?.jackpot === true) return true;
    if (meta?.isJackpot === true) return true;
    if (meta?.hitJackpot === true) return true;
    if (meta?.jackpotWin === true) return true;
    if (meta?.winType && String(meta.winType).toUpperCase() === 'JACKPOT') return true;

    // fallback: s'il y a un champ "jackpotAmount" positif
    const ja = Number(meta?.jackpotAmount ?? meta?.jackpotWinAmount ?? meta?.jackpotPayout);
    if (Number.isFinite(ja) && ja > 0) return true;

    // fallback: gros win + flag "jackpot" dans string
    const s = JSON.stringify(meta ?? {}).toUpperCase();
    if (s.includes('JACKPOT') && Number(e?.deltaCredits || 0) > 0) return true;

    return false;
  }

  private async progressForQuest(userId: number, q: QuestDef, since: Date | null): Promise<ProgressResult> {
    const goal = Math.max(1, Number(q.goal ?? 1));

    if (q.kind === 'LOGIN') {
      return { progress: 1, goal: 1, complete: true };
    }

    const user = await this.getUserById(userId);

    // 🥚 SECRET: 4 clés + validation via page (/easter-egg -> bouton retour)
    if (q.kind === 'EASTER_EGG_KEYS') {
      const s = Boolean((user as any)?.eggKeySlots);
      const b = Boolean((user as any)?.eggKeyBlackjack);
      const r = Boolean((user as any)?.eggKeyRoulette);
      const p = Boolean((user as any)?.eggKeyPoker);

      const keysCount = [s, b, r, p].filter(Boolean).length;
      const visited = Boolean((user as any)?.eggEasterEggVisited);

      const progress = this.clamp(keysCount, 0, 4);
      const complete = keysCount >= 4 && visited;

      return { progress, goal: 4, complete };
    }

    // ✅ SECRET_FIRST_STEPS : gagner la toute première partie sur chaque jeu (4 jeux)
    if (q.kind === 'SECRET_FIRST_STEPS') {
      // On prend tous les events (ASC) et on récupère le 1er event pour chaque jeu.
      const all = await this.fetchEventsAscAllTime(userId, 10000);

      const games: GameKey[] = ['SLOTS', 'ROULETTE', 'BLACKJACK', 'POKER'];
      const firstByGame: Partial<Record<GameKey, any>> = {};

      for (const e of all) {
        const g = String(e.game || '').toUpperCase();
        if (g !== 'SLOTS' && g !== 'ROULETTE' && g !== 'BLACKJACK' && g !== 'POKER') continue;

        const gg = g as GameKey;
        if (!firstByGame[gg]) firstByGame[gg] = e;
        const done = games.every((x) => firstByGame[x]);
        if (done) break;
      }

      let progress = 0;
      let impossible = false;

      for (const g of games) {
        const ev = firstByGame[g];
        if (!ev) continue; // pas encore joué ce jeu

        const won = Number(ev.deltaCredits || 0) > 0;
        if (!won) {
          // 1ère partie perdue => impossible définitif
          impossible = true;
        } else {
          progress++;
        }
      }

      const clamped = this.clamp(progress, 0, 4);
      const complete = !impossible && clamped >= 4;

      return { progress: clamped, goal: 4, complete, impossible };
    }

    // ✅ SLOTS_TRIPLE_JACKPOT : 3 jackpots sur 3 machines différentes
    if (q.kind === 'SLOTS_TRIPLE_JACKPOT') {
      const rows = await this.fetchEvents(userId, since, 6000, 'SLOTS');

      const got = new Set<string>();
      for (const e of rows) {
        if (Number(e.deltaCredits || 0) <= 0) continue;

        const meta =
          this.safeJsonParse((e as any).metaJson) ?? this.safeJsonParse((e as any).meta) ?? null;

        if (!this.isJackpotEvent(e, meta)) continue;

        const machine = this.normalizeSlotMachine(meta);
        if (!machine) continue;

        got.add(machine);

        if (got.size >= 3) break;
      }

      const p = this.clamp(got.size, 0, 3);
      return { progress: p, goal: 3, complete: got.size >= 3 };
    }

    // ✅ A) ROULETTE : gagner sur 0
    if (q.kind === 'ROULETTE_WIN_ZERO') {
      const rows = await this.fetchEvents(userId, since, 2000, 'ROULETTE');
      for (const e of rows) {
        if (Number(e.deltaCredits || 0) <= 0) continue;
        const meta =
          this.safeJsonParse((e as any).metaJson) ?? this.safeJsonParse((e as any).meta) ?? null;

        const number = meta?.number ?? meta?.result?.number ?? meta?.spin?.number ?? null;
        if (Number(number) === 0) {
          return { progress: 1, goal: 1, complete: true };
        }
      }
      return { progress: 0, goal: 1, complete: false };
    }

    // ✅ B) BLACKJACK : gagner sans hit (meta.noHit === true idéalement)
    if (q.kind === 'BLACKJACK_WIN_NO_HIT') {
      const rows = await this.fetchEvents(userId, since, 3000, 'BLACKJACK');
      for (const e of rows) {
        if (Number(e.deltaCredits || 0) <= 0) continue;

        const meta =
          this.safeJsonParse((e as any).metaJson) ?? this.safeJsonParse((e as any).meta) ?? null;

        if (meta?.noHit === true) {
          return { progress: 1, goal: 1, complete: true };
        }

        const actions = meta?.actions ?? meta?.playerActions ?? meta?.turns ?? null;
        if (Array.isArray(actions) && actions.length > 0) {
          const hasHit = actions.some((a: any) => String(a?.type ?? a ?? '').toLowerCase() === 'hit');
          if (!hasHit) return { progress: 1, goal: 1, complete: true };
        }
      }
      return { progress: 0, goal: 1, complete: false };
    }

    // ✅ C) POKER : gagner un pot avec FLUSH+
    if (q.kind === 'POKER_WIN_FLUSH_PLUS') {
      const rows = await this.fetchEvents(userId, since, 4000, 'POKER');
      for (const e of rows) {
        if (Number(e.deltaCredits || 0) <= 0) continue;

        const meta =
          this.safeJsonParse((e as any).metaJson) ?? this.safeJsonParse((e as any).meta) ?? null;

        const rank =
          meta?.handRank ??
          meta?.winnerHandRank ??
          meta?.winningHandRank ??
          meta?.rank ??
          meta?.hand?.rank ??
          meta?.winner?.handRank ??
          null;

        const v = this.pokerRankValue(rank);
        if (v >= this.pokerRankValue('FLUSH')) {
          return { progress: 1, goal: 1, complete: true };
        }
      }
      return { progress: 0, goal: 1, complete: false };
    }

    // SURVIVOR
    if (q.kind === 'SURVIVOR_PLAY') {
      const max = Number(q.creditsMax ?? 0);
      const condOk = !!user && Number(user.credits ?? 0) <= max;
      if (!condOk) return { progress: 0, goal, complete: false };

      const rows = await this.fetchEvents(userId, since, 1200);
      const rows2 = this.filterByMinBet(rows, q.minBet);
      const p = this.clamp(rows2.length, 0, goal);
      return { progress: p, goal, complete: rows2.length >= goal };
    }

    // COMEBACK
    if (q.kind === 'COMEBACK_TO_CREDITS') {
      const target = Math.max(1, Number(q.targetCredits ?? 100));
      const nowCredits = Number(user?.credits ?? 0);

      const since24h = new Date(Date.now() - 24 * 3600_000);
      const recent = await this.fetchEvents(userId, since24h, 600);
      let hadZeroIn24h = nowCredits <= 0;

      if (!hadZeroIn24h) {
        for (const e of recent) {
          const meta = this.safeJsonParse((e as any).metaJson) ?? null;
          const after = this.extractBalanceAfter(meta);
          if (after !== null && after <= 0) {
            hadZeroIn24h = true;
            break;
          }
        }
      }

      if (!hadZeroIn24h) return { progress: 0, goal: target, complete: false };

      const p = this.clamp(nowCredits, 0, target);
      return { progress: p, goal: target, complete: nowCredits >= target };
    }

    if (q.kind === 'PLAY_ANY') {
      const rows = await this.fetchEvents(userId, since, 200);
      const p = rows.length > 0 ? 1 : 0;
      return { progress: p, goal: 1, complete: rows.length > 0 };
    }

    if (q.kind === 'PLAY_GAME') {
      const rows = await this.fetchEvents(userId, since, 400, q.game);
      const rows2 = this.filterByMinBet(rows, q.minBet);
      const p = rows2.length > 0 ? 1 : 0;
      return { progress: p, goal: 1, complete: rows2.length > 0 };
    }

    if (q.kind === 'PLAY_DIFFERENT_GAMES') {
      const rows = await this.fetchEvents(userId, since, 1200);
      const played = new Set<string>();
      for (const e of rows) {
        const g = String(e.game || '').toUpperCase();
        if (g === 'POKER' || g === 'BLACKJACK' || g === 'ROULETTE' || g === 'SLOTS') {
          played.add(g);
        }
      }
      const p = this.clamp(played.size, 0, goal);
      return { progress: p, goal, complete: played.size >= goal };
    }

    if (q.kind === 'PLAY_N_TOTAL') {
      const rows = await this.fetchEvents(userId, since, 2000);
      const rows2 = this.filterByMinBet(rows, q.minBet);
      const p = this.clamp(rows2.length, 0, goal);
      return { progress: p, goal, complete: rows2.length >= goal };
    }

    if (q.kind === 'PLAY_N_SAME_GAME') {
      const rows = await this.fetchEvents(userId, since, 2000);
      const rows2 = this.filterByMinBet(rows, q.minBet);

      const counts: Record<string, number> = { POKER: 0, BLACKJACK: 0, ROULETTE: 0, SLOTS: 0 };
      for (const e of rows2) {
        const g = String(e.game || '').toUpperCase();
        if (counts[g] !== undefined) counts[g]++;
      }

      const best = Math.max(counts.POKER, counts.BLACKJACK, counts.ROULETTE, counts.SLOTS);
      const p = this.clamp(best, 0, goal);
      return { progress: p, goal, complete: best >= goal };
    }

    if (q.kind === 'PLAY_N_IN_GAME') {
      const rows = await this.fetchEvents(userId, since, 3000, q.game);
      const rows2 = this.filterByMinBet(rows, q.minBet);
      const p = this.clamp(rows2.length, 0, goal);
      return { progress: p, goal, complete: rows2.length >= goal };
    }

    if (q.kind === 'WIN_N_IN_GAME') {
      const rows = await this.fetchEvents(userId, since, 3000, q.game);
      const rows2 = this.filterByMinBet(rows, q.minBet);
      const wins = this.countWins(rows2);
      const p = this.clamp(wins, 0, goal);
      return { progress: p, goal, complete: wins >= goal };
    }

    if (q.kind === 'POKER_WIN_HAND') {
      const rows = await this.fetchEvents(userId, since, 2000, 'POKER');
      const wins = this.countWins(rows);
      const p = wins > 0 ? 1 : 0;
      return { progress: p, goal: 1, complete: wins > 0 };
    }

    if (q.kind === 'GAIN_POINTS') {
      const rows = await this.fetchEvents(userId, since, 2500, q.game);
      const sum = this.sumPoints(rows);
      const p = this.clamp(sum, 0, goal);
      return { progress: p, goal, complete: sum >= goal };
    }

    if (q.kind === 'GAIN_POINTS_SERIES_TABLES') {
      const rows = await this.fetchEvents(userId, since, 4000, q.game);
      const tables = new Set<string>();

      for (const e of rows) {
        if (Number(e.deltaPoints || 0) <= 0) continue;
        const meta = this.safeJsonParse((e as any).metaJson) ?? null;
        const code = this.extractTableCode(meta);
        if (code) tables.add(code);
      }

      const p = this.clamp(tables.size, 0, goal);
      return { progress: p, goal, complete: tables.size >= goal };
    }

    return { progress: 0, goal: 1, complete: false };
  }

  async listForUser(userId: number): Promise<QuestView[]> {
    const out: QuestView[] = [];

    for (const q of this.quests) {
      const state = await this.getState(userId, q.key);
      const lastClaimedAt = state.lastClaimedAt;

      const cooldownReady = this.isCooldownReady(lastClaimedAt, q.cooldownHours);
      const since = lastClaimedAt;

      const { progress, goal, complete, impossible } = await this.progressForQuest(userId, q, since);

      const alreadyClaimed = !!lastClaimedAt;

      let title = q.title;
      let description = q.description;

      // 🥚 Easter egg special UX
      if (q.kind === 'EASTER_EGG_KEYS') {
        if (alreadyClaimed) {
          title = "Trouver l'easter egg";
          description = 'Tu as déjà récupéré la récompense de cette quête.';
        } else {
          if (progress >= 4 && !complete) {
            description = 'Les 4 indices sont réunis… Une route cachée t’attend.';
          }
          if (complete) {
            description =
              'Tu as trouvé la route cachée… Retourne dans les quêtes pour récupérer ta récompense.';
          }
        }
      }

      // 🕵️ Secret “Premiers pas” UX
      if (q.kind === 'SECRET_FIRST_STEPS') {
        const goalLocal = 4;

        if (alreadyClaimed) {
          // après claim: on révèle le vrai nom/desc
          title = 'Premiers pas';
          description = 'Tu as déjà récupéré la récompense de cette quête.';
        } else if (impossible) {
          // visible ??? + impossible
          title = '???';
          description = 'Impossible à compléter (une première partie a été perdue).';
        } else if (!complete) {
          title = '???';
          description = `Un défi unique… mais gare à toi, car si tu échoue il sera impossible de le compléter !`;
        } else {
          // réussi => on révèle
          title = 'Premiers pas';
          description = 'Tu as gagné ta première partie sur chaque jeu ! Récupère ta récompense.';
        }
      }

      // canClaim rules
      const canClaim =
        q.kind === 'EASTER_EGG_KEYS'
          ? complete && !alreadyClaimed
          : q.kind === 'SECRET_FIRST_STEPS'
            ? complete && !alreadyClaimed
            : cooldownReady && complete;

      const next =
        q.kind === 'EASTER_EGG_KEYS' || q.kind === 'SECRET_FIRST_STEPS'
          ? null
          : this.computeNextAvailableAt(lastClaimedAt, q.cooldownHours);

      out.push({
        key: q.key,
        title,
        description,
        cooldownHours: q.cooldownHours,
        rewardCredits: q.rewardCredits,

        progress,
        goal,

        canClaim,
        nextAvailableAt: next ? next.toISOString() : null,
        lastClaimedAt: lastClaimedAt ? lastClaimedAt.toISOString() : null,
      });
    }

    return out;
  }

  async claim(userId: number, username: string, questKey: string) {
    const q = this.quests.find((x) => x.key === questKey);
    if (!q) throw new BadRequestException('QUEST_NOT_FOUND');

    const state = await this.getState(userId, q.key);

    // quests "1 fois par compte"
    if (q.kind === 'EASTER_EGG_KEYS' || q.kind === 'SECRET_FIRST_STEPS') {
      if (state.lastClaimedAt) {
        throw new BadRequestException('QUEST_ALREADY_CLAIMED');
      }
      // pas de cooldown
    } else {
      if (!this.isCooldownReady(state.lastClaimedAt, q.cooldownHours)) {
        throw new BadRequestException('QUEST_COOLDOWN');
      }
    }

    const pr = await this.progressForQuest(userId, q, state.lastClaimedAt);

    // bloquer claim si impossible sur "Premiers pas"
    if (q.kind === 'SECRET_FIRST_STEPS' && pr.impossible) {
      throw new BadRequestException('QUEST_IMPOSSIBLE');
    }

    if (!pr.complete) throw new BadRequestException('QUEST_NOT_COMPLETE');

    await this.usersService.creditCreditsByUsername(username, q.rewardCredits);

    state.lastClaimedAt = this.now();
    await this.questRepo.save(state);

    const u = await this.usersService.findByUsername(username);

    return {
      ok: true,
      questKey: q.key,
      rewardCredits: q.rewardCredits,
      credits: u?.credits ?? null,
    };
  }
}
