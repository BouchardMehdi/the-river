import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import type { JwtUser } from '../../auth/jwt.strategy';
import { UserEntity } from '../../users/entities/user.entity';
import { SpinSlotsDto, SlotMachineType } from './dto/spin-slots.dto';
import { StatsService } from '../stats/stats.service';
import { UsersService } from '../../users/users.service';

type SymbolId =
  | 'CHERRY'
  | 'LEMON'
  | 'BELL'
  | 'CLUB'
  | 'DIAMOND'
  | 'CHEST'
  | 'SEVEN';

type Grid = SymbolId[][]; // [row][col]

type Win = {
  name: string;
  symbol: SymbolId;
  cells: Array<[number, number]>;
  payout: number;
};

@Injectable()
export class SlotsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
    private readonly statsService: StatsService,
    private readonly usersService: UsersService, // ✅ AJOUT (ne touche pas le reste)
  ) {}

  // ---------------- CONFIG ----------------

  private readonly machineConfig: Record<
    SlotMachineType,
    { rows: number; cols: number; prices: Record<number, number> }
  > = {
    SLOT_3X3: { rows: 3, cols: 3, prices: { 1: 5, 10: 40 } },
    SLOT_3X5: { rows: 3, cols: 5, prices: { 1: 15, 10: 100 } },
    SLOT_5X5: { rows: 5, cols: 5, prices: { 1: 25, 10: 200 } },
  };

  private readonly symbolWeights: Array<{ s: SymbolId; w: number }> = [
    { s: 'CHERRY', w: 30 },
    { s: 'LEMON', w: 25 },
    { s: 'BELL', w: 15 },
    { s: 'CLUB', w: 12 },
    { s: 'DIAMOND', w: 8 },
    { s: 'CHEST', w: 6 },
    { s: 'SEVEN', w: 4 },
  ];

  private readonly symbolMult: Record<SymbolId, number> = {
    CHERRY: 0.6,
    LEMON: 0.8,
    BELL: 1.2,
    CLUB: 1.5,
    DIAMOND: 2.5,
    CHEST: 4.0,
    SEVEN: 8.0,
  };

  private readonly patternFactor: Record<string, number> = {
    LINE_3: 1.0,
    COL_3: 1.0,
    DIAG_3: 1.1,
    X_3: 1.6,

    LINE_4: 1.7,
    LINE_5: 3.0,
    COL_5: 3.0,
    DIAG_5: 3.5,

    ZIG: 2.5,
    ZAG: 2.5,

    TOP_2ROWS: 5.0,
    BOTTOM_2ROWS: 5.0,
    EYE: 6.0,

    CROSS: 6.0,
    BIG_X: 6.5,
    HOURGLASS: 8.0,

    JACKPOT: 20.0,
  };

  private readonly maxPayoutMultiplier = 500;

  // ---------------- PUBLIC API ----------------

  async spin(user: JwtUser, dto: SpinSlotsDto) {
    const cfg = this.machineConfig[dto.machine];
    if (!cfg) throw new BadRequestException('Machine invalide');

    const totalCost = cfg.prices[dto.spins];
    if (!totalCost) {
      const allowed = Object.keys(cfg.prices).join(', ');
      throw new BadRequestException(
        `Nombre de spins invalide pour ${dto.machine}. Autorisés: ${allowed}`,
      );
    }

    // ✅ On calcule et applique crédits en transaction
    // ✅ Puis on enregistre UN SEUL event stats (game_events) après transaction
    const txResult = await this.dataSource.transaction(async (manager) => {
      const userRepo = manager.getRepository(UserEntity);

      const debit = await userRepo
        .createQueryBuilder()
        .update(UserEntity)
        .set({ credits: () => `credits - ${totalCost}` })
        .where('userId = :id', { id: user.userId })
        .andWhere('credits >= :cost', { cost: totalCost })
        .execute();

      if (!debit.affected || debit.affected !== 1) {
        throw new BadRequestException('Crédits insuffisants');
      }

      const dbUser = await userRepo.findOne({ where: { userId: user.userId } });
      if (!dbUser) throw new BadRequestException('Utilisateur introuvable');

      const betPerSpin = this.getBetPerSpin(dto.machine, dto.spins);

      const results: Array<{ grid: Grid; wins: Win[]; payout: number }> = [];
      let totalPayout = 0;

      for (let i = 0; i < dto.spins; i++) {
        const grid = this.generateGrid(cfg.rows, cfg.cols);
        const wins = this.computeWins(dto.machine, grid, betPerSpin);
        const payout = wins.reduce((a, w) => a + w.payout, 0);

        totalPayout += payout;
        results.push({ grid, wins, payout });
      }

      if (totalPayout > 0) {
        await userRepo
          .createQueryBuilder()
          .update(UserEntity)
          .set({ credits: () => `credits + ${totalPayout}` })
          .where('userId = :id', { id: user.userId })
          .execute();
      }

      const finalUser = await userRepo.findOne({ where: { userId: user.userId } });
      if (!finalUser) throw new BadRequestException('Utilisateur introuvable');

      const net = totalPayout - totalCost;

      return {
        username: finalUser.username,
        machine: dto.machine,
        spins: dto.spins,
        totalCost,
        betPerSpin,
        totalPayout,
        net,
        credits: finalUser.credits,
        results,
      };
    });

    // ✅ On ne renvoie pas username au front
    const { username: _u, ...payload } = txResult;

    // ✅ Détecte si un JACKPOT a été touché sur AU MOINS un spin (sert aussi pour quêtes)
    const hitJackpot =
      payload.results?.some((r: any) =>
        (r?.wins ?? []).some((w: any) => w?.name === 'JACKPOT' && Number(w?.payout ?? 0) > 0),
      ) ?? false;

    // ✅ Event unique dans game_events (graph/leaderboard)
    await this.statsService.recordEvent(txResult.username, {
      game: 'SLOTS',
      deltaCredits: txResult.net,
      deltaPoints: 0,
      meta: {
        machine: txResult.machine,
        spins: txResult.spins,
        totalCost: txResult.totalCost,
        totalPayout: txResult.totalPayout,
        hitJackpot, // ✅ utile pour la quête "Triple Jackpot"
      },
    });

    // 🥚 Easter egg: jackpot (pattern JACKPOT gagnant)
    const unlockedNow: string[] = [];

    if (hitJackpot) {
      try {
        const did = await this.usersService.unlockEasterEggKeyByUserId(user.userId, 'slots');
        if (did) unlockedNow.push('slots');
      } catch {
        // ignore
      }
    }

    return { ...payload, unlockedNow };
  }

  // ---------------- PRICING HELPERS ----------------

  private getBetPerSpin(machine: SlotMachineType, spins: number): number {
    const cfg = this.machineConfig[machine];
    const total = cfg.prices[spins];
    return Math.max(1, Math.floor(total / spins));
  }

  // ---------------- RNG ----------------

  private pickSymbol(): SymbolId {
    const total = this.symbolWeights.reduce((a, x) => a + x.w, 0);
    let r = Math.random() * total;
    for (const x of this.symbolWeights) {
      r -= x.w;
      if (r <= 0) return x.s;
    }
    return 'CHERRY';
  }

  private generateGrid(rows: number, cols: number): Grid {
    const grid: Grid = [];
    for (let r = 0; r < rows; r++) {
      const row: SymbolId[] = [];
      for (let c = 0; c < cols; c++) row.push(this.pickSymbol());
      grid.push(row);
    }
    return grid;
  }

  // ---------------- WIN LOGIC ----------------

  private computeWins(machine: SlotMachineType, grid: Grid, betPerSpin: number): Win[] {
    const wins: Win[] = [];
    const rows = grid.length;
    const cols = grid[0]?.length ?? 0;

    const addPatternIfAllSame = (name: string, cells: Array<[number, number]>) => {
      if (!cells.length) return;
      const [r0, c0] = cells[0];
      const sym = grid[r0][c0];
      if (!sym) return;

      for (const [r, c] of cells) {
        if (grid[r]?.[c] !== sym) return;
      }

      const payout = this.computePayout(name, sym, betPerSpin);
      wins.push({ name, symbol: sym, cells, payout });
    };

    const addAnyRowStreak = (name: string, n: number) => {
      for (let r = 0; r < rows; r++) {
        for (let start = 0; start <= cols - n; start++) {
          const sym = grid[r][start];
          let ok = true;
          for (let k = 1; k < n; k++) {
            if (grid[r][start + k] !== sym) {
              ok = false;
              break;
            }
          }
          if (ok) {
            const cells: Array<[number, number]> = [];
            for (let k = 0; k < n; k++) cells.push([r, start + k]);
            const payout = this.computePayout(name, sym, betPerSpin);
            wins.push({ name, symbol: sym, cells, payout });
          }
        }
      }
    };

    const addAnyFullColumn = (name: string) => {
      for (let c = 0; c < cols; c++) {
        const cells: Array<[number, number]> = [];
        for (let r = 0; r < rows; r++) cells.push([r, c]);
        addPatternIfAllSame(name, cells);
      }
    };

    const addAnyDiagLen3 = (name: string) => {
      for (let r = 0; r <= rows - 3; r++) {
        for (let c = 0; c <= cols - 3; c++) {
          addPatternIfAllSame(name, [
            [r, c],
            [r + 1, c + 1],
            [r + 2, c + 2],
          ]);
        }
      }
      for (let r = 2; r < rows; r++) {
        for (let c = 0; c <= cols - 3; c++) {
          addPatternIfAllSame(name, [
            [r, c],
            [r - 1, c + 1],
            [r - 2, c + 2],
          ]);
        }
      }
    };

    if (machine === 'SLOT_3X3') {
      addAnyRowStreak('LINE_3', 3);
      addAnyFullColumn('COL_3');

      addPatternIfAllSame('DIAG_3', [
        [0, 0],
        [1, 1],
        [2, 2],
      ]);
      addPatternIfAllSame('DIAG_3', [
        [2, 0],
        [1, 1],
        [0, 2],
      ]);

      addPatternIfAllSame('X_3', [
        [0, 0],
        [1, 1],
        [2, 2],
        [2, 0],
        [0, 2],
      ]);

      const all: Array<[number, number]> = [];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) all.push([r, c]);
      addPatternIfAllSame('JACKPOT', all);
    }

    if (machine === 'SLOT_3X5') {
      addAnyFullColumn('COL_3');

      addAnyRowStreak('LINE_3', 3);
      addAnyRowStreak('LINE_4', 4);
      addAnyRowStreak('LINE_5', 5);

      addAnyDiagLen3('DIAG_3');

      addPatternIfAllSame('ZIG', [
        [0, 0],
        [1, 1],
        [2, 2],
        [1, 3],
        [0, 4],
      ]);
      addPatternIfAllSame('ZAG', [
        [2, 0],
        [1, 1],
        [0, 2],
        [1, 3],
        [2, 4],
      ]);

      const top2: Array<[number, number]> = [];
      // Shape:
      // r0: #####
      // r1: .###.
      // r2: ..#..
      for (let c = 0; c < 5; c++) top2.push([0, c]);
      for (let c = 1; c <= 3; c++) top2.push([1, c]);
      top2.push([2, 2]);
      addPatternIfAllSame('TOP_2ROWS', top2);

      const bottom2: Array<[number, number]> = [];
      // Shape:
      // r0: ..#..
      // r1: .###.
      // r2: #####
      bottom2.push([0, 2]);
      for (let c = 1; c <= 3; c++) bottom2.push([1, c]);
      for (let c = 0; c < 5; c++) bottom2.push([2, c]);
      addPatternIfAllSame('BOTTOM_2ROWS', bottom2);

      const eye: Array<[number, number]> = [];
      // Shape:
      // r0: .###.
      // r1: ##.##
      // r2: .###.
      for (let c = 1; c <= 3; c++) eye.push([0, c]);
      for (const c of [0, 1, 3, 4]) eye.push([1, c]);
      for (let c = 1; c <= 3; c++) eye.push([2, c]);
      addPatternIfAllSame('EYE', eye);

      const all: Array<[number, number]> = [];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) all.push([r, c]);
      addPatternIfAllSame('JACKPOT', all);
    }

    if (machine === 'SLOT_5X5') {
      addAnyRowStreak('LINE_5', 5);
      addAnyFullColumn('COL_5');

      addPatternIfAllSame('DIAG_5', [
        [0, 0],
        [1, 1],
        [2, 2],
        [3, 3],
        [4, 4],
      ]);
      addPatternIfAllSame('DIAG_5', [
        [4, 0],
        [3, 1],
        [2, 2],
        [1, 3],
        [0, 4],
      ]);

      const crossSet = new Set<string>();
      const cross: Array<[number, number]> = [];
      for (let c = 0; c < 5; c++) crossSet.add(`2,${c}`);
      for (let r = 0; r < 5; r++) crossSet.add(`${r},2`);
      for (const key of crossSet) {
        const [r, c] = key.split(',').map(Number);
        cross.push([r, c]);
      }
      addPatternIfAllSame('CROSS', cross);

      const bxSet = new Set<string>();
      for (let i = 0; i < 5; i++) bxSet.add(`${i},${i}`);
      for (let i = 0; i < 5; i++) bxSet.add(`${4 - i},${i}`);
      const bigX: Array<[number, number]> = [];
      for (const key of bxSet) {
        const [r, c] = key.split(',').map(Number);
        bigX.push([r, c]);
      }
      addPatternIfAllSame('BIG_X', bigX);

      const hg: Array<[number, number]> = [];
      for (let c = 0; c < 5; c++) hg.push([0, c]);
      for (let c = 1; c <= 3; c++) hg.push([1, c]);
      hg.push([2, 2]);
      for (let c = 1; c <= 3; c++) hg.push([3, c]);
      for (let c = 0; c < 5; c++) hg.push([4, c]);
      addPatternIfAllSame('HOURGLASS', hg);

      const all: Array<[number, number]> = [];
      for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) all.push([r, c]);
      addPatternIfAllSame('JACKPOT', all);
    }

    return wins;
  }

  private computePayout(patternName: string, sym: SymbolId, bet: number): number {
    const factor = this.patternFactor[patternName] ?? 1.0;
    const sMult = this.symbolMult[sym] ?? 1.0;

    let payout = Math.floor(bet * sMult * factor);
    if (payout < 1) payout = 1;

    const cap = bet * this.maxPayoutMultiplier;
    if (payout > cap) payout = cap;

    return payout;
  }
}
