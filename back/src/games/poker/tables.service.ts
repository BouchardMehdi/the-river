import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { PokerTableEntity, TableMode, TableVisibility } from './entities/poker-table.entity';
import { toPublic } from './domain/table.mapper';
import type { ActionType, PokerTablePublic } from './domain/table.types';

import { PlayerService } from './services/player.service';
import { GameService } from './services/game.service';
import { BettingService } from './services/betting.service';
import { TableResetService } from './services/table-reset.service';
import { BotService } from './services/bot.service';
import { UsersService } from '../../users/users.service';
import { ChatGateway } from './chat/chat.gateway';
import { HandEvaluatorService } from './services/hand-evaluator.service';

import { StatsService } from '../stats/stats.service';
import { randomCode } from '../../common/random';

type Card = { rank: string; suit: string };

type Street = 'PRE_FLOP' | 'FLOP' | 'TURN' | 'RIVER' | 'SHOWDOWN' | 'WAITING';

@Injectable()
export class TablesService {
  private readonly COMP_BUY_IN = 100;
  private readonly COMP_SMALL_BLIND = 5;
  private readonly COMP_BIG_BLIND = 10;
  private readonly COMP_MIN_PLAYERS = 4;
  private readonly COMP_MAX_PLAYERS = 6;
  private readonly COMP_AUTO_START_MS = 25000;
  private readonly COMP_POINT_WINDOW = 250;
  private readonly competitionTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    @InjectRepository(PokerTableEntity)
    private readonly repo: Repository<PokerTableEntity>,
    private readonly playerService: PlayerService,
    private readonly gameService: GameService,
    private readonly bettingService: BettingService,
    private readonly tableResetService: TableResetService,
    private readonly botService: BotService,
    private readonly usersService: UsersService,
    private readonly chatGateway: ChatGateway,
    private readonly handEvaluator: HandEvaluatorService,
    private readonly statsService: StatsService,
  ) {}

  private generateTableCode6(): string {
    return randomCode('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 6);
  }

  private normalizeCode(code: string): string {
    return (code || '').trim().toUpperCase();
  }

  private isBotId(id: string): boolean {
    return id.includes('-bot-');
  }

  private humanCount(players: string[]): number {
    return (players ?? []).filter((p) => !this.isBotId(p)).length;
  }

  private isCompetition(internal: any): boolean {
    return String(internal.mode ?? '').toUpperCase() === 'COMPETITION';
  }

  private competitionEliminations(internal: any): string[] {
    const value = internal.bustedPlayers?.__competitionEliminations;
    return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
  }

  private setCompetitionEliminations(internal: any, eliminations: string[]): void {
    internal.bustedPlayers ??= {};
    internal.bustedPlayers.__competitionEliminations = Array.from(new Set(eliminations));
  }

  private competitionStartAt(internal: any): number | null {
    const explicit = Number(internal.competitionAutoStartAt ?? 0);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;

    const created = Date.parse(String(internal.createdAt ?? ''));
    if (!Number.isFinite(created)) return null;
    return created + this.COMP_AUTO_START_MS;
  }

  private decorateCompetitionQueue(internal: any): void {
    if (!this.isCompetition(internal)) return;
    internal.visibility = 'PRIVATE';
    internal.fillWithBots = false;
    internal.maxPlayers = this.COMP_MAX_PLAYERS;
    internal.competitionAutoStartAt = this.competitionStartAt(internal) ?? (Date.now() + this.COMP_AUTO_START_MS);
  }

  private async deleteTable(tableId: string): Promise<void> {
    await this.repo.delete({ id: tableId });
    this.botService.clearTable(tableId);
    const timer = this.competitionTimers.get(tableId);
    if (timer) clearTimeout(timer);
    this.competitionTimers.delete(tableId);
  }

  private getActivePlayers(internal: any): string[] {
    return (internal.players ?? []).filter((pid: string) => {
      const stack = Number(internal.stacks?.[pid] ?? 0);
      const folded = !!internal.foldedPlayers?.[pid];
      return stack > 0 && !folded;
    });
  }

  private getAliveStacks(internal: any): string[] {
    return (internal.players ?? []).filter((pid: string) => Number(internal.stacks?.[pid] ?? 0) > 0);
  }

  private isBettingRoundComplete(internal: any): boolean {
    const active = this.getActivePlayers(internal);
    if (active.length <= 1) return true;

    const currentBet = Number(internal.currentBet ?? 0);
    for (const pid of active) {
      const acted = !!internal.hasActed?.[pid];
      const bet = Number(internal.bets?.[pid] ?? 0);
      if (!acted || bet !== currentBet) return false;
    }

    return true;
  }

  private scheduleCompetitionStart(tableId: string): void {
    if (this.competitionTimers.has(tableId)) return;

    const runAt = Date.now() + this.COMP_AUTO_START_MS + 350;
    const delay = Math.max(250, runAt - Date.now());

    const timer = setTimeout(async () => {
      this.competitionTimers.delete(tableId);
      try {
        const table = await this.repo.findOneBy({ id: tableId });
        if (!table) return;
        const internal = table as any;
        const started = await this.tryAutoStartCompetition(internal, true);
        if (started) await this.repo.save(internal);
      } catch {
        // prochain poll du front = nouvelle tentative
      }
    }, delay);

    this.competitionTimers.set(tableId, timer);
  }

  private async tryAutoStartCompetition(internal: any, fromTimer = false): Promise<boolean> {
    if (!this.isCompetition(internal)) return false;
    if (internal.status !== 'WAITING' && internal.status !== 'OPEN') return false;

    this.decorateCompetitionQueue(internal);
    const humans = this.humanCount(internal.players ?? []);

    if (humans < this.COMP_MIN_PLAYERS) {
      this.scheduleCompetitionStart(internal.id);
      return false;
    }

    const startAt = this.competitionStartAt(internal) ?? Date.now();
    if (humans < this.COMP_MAX_PLAYERS && Date.now() < startAt && !fromTimer) {
      this.scheduleCompetitionStart(internal.id);
      return false;
    }

    internal.ownerPlayerId = (internal.players ?? [])[0];
    if (!internal.ownerPlayerId) return false;

    internal.fillWithBots = false;
    this.gameService.startGame(internal, internal.ownerPlayerId);
    if (internal.status !== 'IN_GAME') return false;

    internal.startedAt = new Date().toISOString();
    internal.competitionAutoStartAt = undefined;
    this.chatGateway.emitSystemToTable(internal.id, `Match competitif lance automatiquement (${humans} joueurs).`);
    await this.autoProgressCompletedRounds(internal.id, internal);
    return true;
  }

  private async competitionAveragePoints(players: string[]): Promise<number> {
    const humans = players.filter((player) => !this.isBotId(player));
    if (humans.length === 0) return 0;

    const points = await Promise.all(
      humans.map(async (username) => {
        const user = await this.usersService.findByUsername(username);
        return Number(user?.points ?? 0);
      }),
    );

    return points.reduce((sum, value) => sum + value, 0) / points.length;
  }

  private async findBestCompetitionQueue(username: string, points: number): Promise<any | null> {
    const tables = await this.repo.find();
    let best: { table: any; distance: number; size: number } | null = null;

    for (const table of tables) {
      const internal = table as any;
      if (!this.isCompetition(internal)) continue;
      if (internal.status !== 'WAITING' && internal.status !== 'OPEN') continue;
      if ((internal.players ?? []).includes(username)) return internal;
      if ((internal.players ?? []).length >= this.COMP_MAX_PLAYERS) continue;

      const average = await this.competitionAveragePoints(internal.players ?? []);
      const waitStartedAt = Date.parse(String(internal.createdAt ?? '')) || Date.now();
      const waitBonus = Math.floor(Math.max(0, Date.now() - waitStartedAt) / 30000) * 100;
      const allowedDistance = this.COMP_POINT_WINDOW + waitBonus;
      const distance = Math.abs(average - points);
      if (distance > allowedDistance) continue;

      const candidate = { table: internal, distance, size: (internal.players ?? []).length };
      if (!best || candidate.distance < best.distance || (candidate.distance === best.distance && candidate.size > best.size)) {
        best = candidate;
      }
    }

    return best?.table ?? null;
  }

  private competitionPointDeltas(placements: Array<{ playerId: string; place: number }>): Record<string, number> {
    const ladder: Record<number, number[]> = {
      4: [24, 8, -10, -22],
      5: [28, 14, 0, -14, -28],
      6: [32, 18, 6, -8, -20, -28],
    };
    const points = ladder[Math.max(this.COMP_MIN_PLAYERS, Math.min(this.COMP_MAX_PLAYERS, placements.length))] ?? ladder[6];
    return Object.fromEntries(placements.map((placement) => [placement.playerId, points[placement.place - 1] ?? -10]));
  }

  private recordCompetitionEliminations(internal: any): void {
    if (!this.isCompetition(internal)) return;
    const eliminations = this.competitionEliminations(internal);

    for (const pid of internal.players ?? []) {
      if (this.isBotId(pid) || eliminations.includes(pid)) continue;
      if (Number(internal.stacks?.[pid] ?? 0) <= 0) eliminations.push(pid);
    }

    this.setCompetitionEliminations(internal, eliminations);
  }

  private getOwnerOrFallback(internal: any): string {
    if (internal.ownerPlayerId && String(internal.ownerPlayerId).trim().length > 0) return internal.ownerPlayerId;

    const humans = (internal.players ?? []).filter((p: string) => !this.isBotId(p));
    if (humans.length > 0) {
      internal.ownerPlayerId = humans[0];
      return internal.ownerPlayerId;
    }

    // dernier fallback : premier joueur
    const any = (internal.players ?? [])[0];
    if (!any) throw new BadRequestException('Aucun owner et aucun joueur disponible');
    internal.ownerPlayerId = any;
    return any;
  }

  // -------------------- AUTO ADVANCE (fix blocages) --------------------

  private phaseOf(internal: any): Street {
    const p = String(internal.phase ?? 'WAITING').toUpperCase();
    if (p === 'PRE_FLOP') return 'PRE_FLOP';
    if (p === 'FLOP') return 'FLOP';
    if (p === 'TURN') return 'TURN';
    if (p === 'RIVER') return 'RIVER';
    if (p === 'SHOWDOWN') return 'SHOWDOWN';
    return 'WAITING';
  }

  private async advanceTo(tableId: string, internal: any, target: Street): Promise<void> {
    // si pas en jeu, on ne force pas
    if (internal.status !== 'IN_GAME') return;

    const owner = this.getOwnerOrFallback(internal);

    // on avance dans l'ordre tant qu'on n'a pas atteint la target
    for (let safety = 0; safety < 12; safety++) {
      const phase = this.phaseOf(internal);
      if (phase === target) return;

      // si on demande SHOWDOWN, on doit passer par river puis endHand
      if (target === 'SHOWDOWN') {
        if (phase === 'PRE_FLOP') {
          this.gameService.revealFlop(internal, owner);
          this.chatGateway.emitSystemToTable(tableId, `🃏 FLOP (auto)`);
          continue;
        }
        if (phase === 'FLOP') {
          this.gameService.revealTurn(internal, owner);
          this.chatGateway.emitSystemToTable(tableId, `🃏 TURN (auto)`);
          continue;
        }
        if (phase === 'TURN') {
          this.gameService.revealRiver(internal, owner);
          this.chatGateway.emitSystemToTable(tableId, `🃏 RIVER (auto)`);
          continue;
        }
        if (phase === 'RIVER') {
          await this.endHandInternal(tableId, internal, owner);
          return;
        }
        if (phase === 'SHOWDOWN') return;
        return;
      }

      // target = FLOP / TURN / RIVER : si on est "avant", on step
      if (target === 'FLOP') {
        if (phase === 'PRE_FLOP') {
          this.gameService.revealFlop(internal, owner);
          this.chatGateway.emitSystemToTable(tableId, `🃏 FLOP (auto)`);
        }
        return;
      }

      if (target === 'TURN') {
        if (phase === 'PRE_FLOP') {
          this.gameService.revealFlop(internal, owner);
          this.chatGateway.emitSystemToTable(tableId, `🃏 FLOP (auto)`);
          continue;
        }
        if (phase === 'FLOP') {
          this.gameService.revealTurn(internal, owner);
          this.chatGateway.emitSystemToTable(tableId, `🃏 TURN (auto)`);
        }
        return;
      }

      if (target === 'RIVER') {
        if (phase === 'PRE_FLOP') {
          this.gameService.revealFlop(internal, owner);
          this.chatGateway.emitSystemToTable(tableId, `🃏 FLOP (auto)`);
          continue;
        }
        if (phase === 'FLOP') {
          this.gameService.revealTurn(internal, owner);
          this.chatGateway.emitSystemToTable(tableId, `🃏 TURN (auto)`);
          continue;
        }
        if (phase === 'TURN') {
          this.gameService.revealRiver(internal, owner);
          this.chatGateway.emitSystemToTable(tableId, `🃏 RIVER (auto)`);
        }
        return;
      }

      return;
    }
  }

  // ✅ Si 0/1 joueur actif : on auto-advance jusqu'au showdown
  private async autoAdvanceIfTrivial(tableId: string, internal: any): Promise<void> {
    if (internal.status !== 'IN_GAME') return;

    const active = this.getActivePlayers(internal);
    if (active.length <= 1) {
      // on déroule la main "dans l'ordre" jusqu'à showdown
      await this.advanceTo(tableId, internal, 'SHOWDOWN');
    }
  }

  private async autoProgressCompletedRounds(tableId: string, internal: any): Promise<void> {
    if (internal.status !== 'IN_GAME') return;

    const owner = this.getOwnerOrFallback(internal);

    for (let safety = 0; safety < 12; safety++) {
      if (internal.status !== 'IN_GAME') return;

      await this.autoAdvanceIfTrivial(tableId, internal);
      if (internal.status !== 'IN_GAME') return;

      const phase = this.phaseOf(internal);
      if (phase === 'WAITING' || phase === 'SHOWDOWN') return;
      if (!this.isBettingRoundComplete(internal)) return;

      if (phase === 'PRE_FLOP') {
        this.gameService.revealFlop(internal, owner);
        this.chatGateway.emitSystemToTable(tableId, 'FLOP');
        continue;
      }

      if (phase === 'FLOP') {
        this.gameService.revealTurn(internal, owner);
        this.chatGateway.emitSystemToTable(tableId, 'TURN');
        continue;
      }

      if (phase === 'TURN') {
        this.gameService.revealRiver(internal, owner);
        this.chatGateway.emitSystemToTable(tableId, 'RIVER');
        continue;
      }

      if (phase === 'RIVER') {
        await this.endHandInternal(tableId, internal, owner);
        return;
      }

      return;
    }
  }

  // -------------------- FIN / CASHOUT --------------------

  private async finalizeGameIfOver(tableId: string, internal: any): Promise<boolean> {
    const alive = this.getAliveStacks(internal);
    if (alive.length !== 1) return false;

    const winnerId = alive[0];
    const winnerStack = Number(internal.stacks?.[winnerId] ?? 0);

    if (this.isCompetition(internal)) {
      const eliminations = this.competitionEliminations(internal).filter((pid) => pid !== winnerId);
      const allPlayers = (internal.players ?? []).filter((pid: string) => !this.isBotId(pid));
      const missing = allPlayers.filter((pid: string) => pid !== winnerId && !eliminations.includes(pid));
      const ordered = [winnerId, ...missing, ...eliminations.slice().reverse()].slice(0, allPlayers.length);
      const deltas = this.competitionPointDeltas(ordered.map((playerId, index) => ({ playerId, place: index + 1 })));
      const placements = ordered.map((playerId, index) => ({
        playerId,
        place: index + 1,
        points: deltas[playerId] ?? 0,
      }));

      for (const placement of placements) {
        if (placement.points === 0) continue;
        try {
          await this.usersService.addPointsByUsername(placement.playerId, placement.points);
          await this.statsService.recordEvent(placement.playerId, {
            game: 'POKER',
            deltaCredits: 0,
            deltaPoints: placement.points,
            meta: { type: 'COMPETITION_PLACEMENT', tableId, place: placement.place },
          });
        } catch {}
      }

      internal.competitionPlacements = placements;
      internal.competitionPointsDeltas = deltas;
      internal.bustedPlayers ??= {};
      internal.bustedPlayers.__competitionPlacements = placements;
      internal.bustedPlayers.__competitionPointsDeltas = deltas;
      this.chatGateway.emitSystemToTable(
        tableId,
        `Classement competition: ${placements.map((p) => `#${p.place} ${p.playerId} (${p.points > 0 ? '+' : ''}${p.points} pts)`).join(' | ')}`,
      );
    } else if (winnerStack > 0 && !this.isBotId(winnerId)) {
      await this.usersService.creditCreditsByUsername(winnerId, winnerStack);
      try {
        await this.statsService.recordEvent(winnerId, {
          game: 'POKER',
          deltaCredits: Math.floor(winnerStack),
          deltaPoints: 0,
          meta: { type: 'CASH_OUT', tableId },
        });
      } catch {}
      this.chatGateway.emitSystemToTable(tableId, `💰 CASHOUT: ${winnerId} +${winnerStack} crédits`);
    }

    internal.status = 'FINISHED';
    internal.phase = 'WAITING';

    for (const pid of internal.players ?? []) internal.stacks[pid] = 0;

    internal.pot = 0;
    internal.currentBet = 0;

    internal.bets = {};
    internal.foldedPlayers = {};
    internal.hasActed = {};
    internal.contributions = {};

    internal.showdownHands = undefined;
    internal.showdownEndsAt = undefined;

    internal.lastWinners = [
      {
        potIndex: 0,
        amount: winnerStack,
        winnerId,
        handDescription: 'Partie terminee',
        handWinner: [],
      },
    ];
    internal.lastWinnerId = winnerId;
    internal.lastWinnerHand = undefined;
    internal.lastWinnerHandDescription = this.isCompetition(internal)
      ? `Match competition termine - ${winnerId} #1`
      : `Partie terminee avec ${winnerStack} credits`;

    this.chatGateway.emitSystemToTable(tableId, `🏁 Partie terminée (un seul joueur a encore du stack).`);
    return true;
  }

  // -------------------- CRUD / GAME --------------------

  async findOne(id: string): Promise<PokerTablePublic> {
    const table = await this.repo.findOneBy({ id: this.normalizeCode(id) });
    if (!table) throw new NotFoundException('La table est introuvable');
    const internal = table as any;
    if (this.isCompetition(internal)) {
      await this.tryAutoStartCompetition(internal);
      await this.repo.save(internal);
    }
    if ((internal.players ?? []).length > 0 && this.humanCount(internal.players ?? []) === 0) {
      await this.deleteTable(internal.id);
      throw new NotFoundException('La table est introuvable');
    }

    return toPublic(internal);
  }

  async listPublicTables(): Promise<PokerTablePublic[]> {
    const tables = await this.repo.find({ where: { visibility: 'PUBLIC' as any } });
    const visible: PokerTablePublic[] = [];

    for (const table of tables) {
      const internal = table as any;
      if (this.isCompetition(internal)) continue;
      if ((internal.status ?? '') === 'DELETED' || (internal.status ?? '') === 'FINISHED') continue;

      if ((internal.players ?? []).length > 0 && this.humanCount(internal.players ?? []) === 0) {
        await this.deleteTable(internal.id);
        continue;
      }

      visible.push(toPublic(internal));
    }

    return visible;
  }

  async listPlayerTables(username: string): Promise<PokerTablePublic[]> {
    if (!username || username.trim().length === 0) throw new BadRequestException('username requis');

    const tables = await this.repo.find();
    const mine: PokerTablePublic[] = [];

    for (const table of tables) {
      const internal = table as any;
      if ((internal.status ?? '') === 'DELETED' || (internal.status ?? '') === 'FINISHED') continue;

      if (this.isCompetition(internal)) {
        await this.tryAutoStartCompetition(internal);
        await this.repo.save(internal);
      }

      const players = internal.players ?? [];
      if (players.length > 0 && this.humanCount(players) === 0) {
        await this.deleteTable(internal.id);
        continue;
      }

      if (players.includes(username)) mine.push(toPublic(internal));
    }

    return mine;
  }

  async createTable(params: {
    ownerUsername: string;
    buyInAmount: number;
    smallBlindAmount: number;
    bigBlindAmount: number;
    maxPlayers?: number;
    fillWithBots?: boolean;
    visibility?: TableVisibility;
    mode?: TableMode;
  }): Promise<{ tableId: string; table: PokerTablePublic }> {
    const ownerUsername = params.ownerUsername;
    if (!ownerUsername || ownerUsername.trim().length === 0) throw new BadRequestException('ownerUsername requis');

    const buyInAmount = Number(params.buyInAmount);
    const smallBlindAmount = Number(params.smallBlindAmount);
    const bigBlindAmount = Number(params.bigBlindAmount);
    const maxPlayers = params.maxPlayers ?? 6;

    if (!Number.isFinite(buyInAmount) || buyInAmount <= 0) throw new BadRequestException('buyInAmount invalide');
    if (!Number.isFinite(smallBlindAmount) || smallBlindAmount <= 0) throw new BadRequestException('smallBlindAmount invalide');
    if (!Number.isFinite(bigBlindAmount) || bigBlindAmount <= 0) throw new BadRequestException('bigBlindAmount invalide');
    if (bigBlindAmount < smallBlindAmount) throw new BadRequestException('bigBlindAmount doit être >= smallBlindAmount');
    if (!Number.isFinite(maxPlayers) || maxPlayers < 2 || maxPlayers > 10) throw new BadRequestException('maxPlayers invalide');

    const mode: TableMode = (params.mode ?? 'CASUAL') as any;
    let visibility: TableVisibility = (params.visibility ?? 'PRIVATE') as any;

    const fillWithBots = mode === 'COMPETITION' ? false : params.fillWithBots === true;
    if (mode === 'COMPETITION') visibility = 'PRIVATE';

    let tableId = this.generateTableCode6();
    for (let i = 0; i < 40; i++) {
      const exists = await this.repo.findOneBy({ id: tableId });
      if (!exists) break;
      tableId = this.generateTableCode6();
    }
    const stillExists = await this.repo.findOneBy({ id: tableId });
    if (stillExists) throw new BadRequestException('Impossible de générer un code de table unique');

    const table = new PokerTableEntity();
    table.id = tableId;
    table.name = tableId;

    table.maxPlayers = maxPlayers;
    table.buyInAmount = buyInAmount;
    table.smallBlindAmount = smallBlindAmount;
    table.bigBlindAmount = bigBlindAmount;

    table.mode = mode;
    table.visibility = visibility;
    table.fillWithBots = fillWithBots;

    table.status = 'OPEN';
    table.phase = 'WAITING';
    table.createdAt = new Date().toISOString();

    table.players = [];
    table.hands = {};
    table.communityCards = [];
    table.deck = [];
    table.burnedCards = [];

    table.showdownHands = undefined;
    table.showdownEndsAt = undefined;

    table.stacks = {};
    table.pot = 0;
    table.currentBet = 0;
    table.bets = {};
    table.foldedPlayers = {};
    table.hasActed = {};
    table.contributions = {};
    table.dealerIndex = 0;
    table.bustedPlayers = {};
    table.lastWinners = undefined;
    table.lastWinnerHandDescription = undefined;
    if (mode === 'COMPETITION') {
      (table as any).competitionAutoStartAt = Date.now() + this.COMP_AUTO_START_MS;
      (table.bustedPlayers as any).__competitionEliminations = [];
    }

    await this.repo.save(table);

    const joined = await this.join(tableId, ownerUsername);
    return { tableId, table: joined };
  }

  async queueCompetition(username: string): Promise<{ tableId: string; table: PokerTablePublic }> {
    const normalized = String(username ?? '').trim();
    if (!normalized) throw new BadRequestException('username requis');

    const user = await this.usersService.findByUsername(normalized);
    if (!user) throw new NotFoundException('User not found');

    const allTables = await this.repo.find();
    for (const table of allTables) {
      const internal = table as any;
      if (!this.isCompetition(internal)) continue;
      if ((internal.status ?? '') === 'FINISHED' || (internal.status ?? '') === 'DELETED') continue;
      if ((internal.players ?? []).includes(user.username)) {
        await this.tryAutoStartCompetition(internal);
        await this.repo.save(internal);
        this.scheduleCompetitionStart(internal.id);
        return { tableId: internal.id, table: toPublic(internal) };
      }
    }

    const queue = await this.findBestCompetitionQueue(user.username, Number(user.points ?? 0));
    if (queue) {
      const joined = await this.join(queue.id, user.username);
      const fresh = await this.repo.findOneBy({ id: queue.id });
      if (fresh) {
        const internal = fresh as any;
        await this.tryAutoStartCompetition(internal);
        await this.repo.save(internal);
        this.scheduleCompetitionStart(internal.id);
        return { tableId: internal.id, table: toPublic(internal) };
      }
      return { tableId: queue.id, table: joined };
    }

    const created = await this.createTable({
      ownerUsername: user.username,
      buyInAmount: this.COMP_BUY_IN,
      smallBlindAmount: this.COMP_SMALL_BLIND,
      bigBlindAmount: this.COMP_BIG_BLIND,
      maxPlayers: this.COMP_MAX_PLAYERS,
      fillWithBots: false,
      visibility: 'PRIVATE',
      mode: 'COMPETITION',
    });
    this.scheduleCompetitionStart(created.tableId);
    return created;
  }

  async joinPublic(tableId: string, username: string): Promise<PokerTablePublic> {
    const id = this.normalizeCode(tableId);
    const table = await this.repo.findOneBy({ id });
    if (!table) throw new NotFoundException('La table est introuvable');
    if (this.isCompetition(table as any)) throw new BadRequestException('Les tables competition ne sont pas publiques');
    if ((table.visibility ?? 'PRIVATE') !== 'PUBLIC') throw new BadRequestException('Cette table est privée (code requis)');
    return this.join(id, username);
  }

  async joinByCode(code: string, username: string): Promise<PokerTablePublic> {
    const normalized = this.normalizeCode(code);
    if (!/^[A-Z]{6}$/.test(normalized)) throw new BadRequestException('Code invalide (6 lettres A-Z)');
    const t = await this.repo.findOneBy({ id: normalized });
    if (!t) throw new NotFoundException('La table est introuvable');
    if (this.isCompetition(t as any)) throw new BadRequestException('Les tables competition ne se rejoignent pas avec un code');
    return this.join(normalized, username);
  }

  async join(tableId: string, username: string): Promise<PokerTablePublic> {
    if (!username || username.trim().length === 0) throw new BadRequestException('username requis');

    const table = await this.repo.findOneBy({ id: tableId });
    if (!table) throw new NotFoundException('La table est introuvable');
    const internal = table as any;

    if (internal.players?.includes(username)) return toPublic(internal);
    if (internal.status === 'IN_GAME') throw new BadRequestException('Partie en cours, impossible de rejoindre');
    if (internal.players.length >= internal.maxPlayers) throw new BadRequestException('la table est pleine');
    if (this.isCompetition(internal) && this.isBotId(username)) throw new BadRequestException('Pas de bot en competition');

    const buyIn = internal.buyInAmount;

    if (!this.isCompetition(internal)) {
      await this.usersService.debitCreditsByUsername(username, buyIn);

      try {
        await this.statsService.recordEvent(username, {
          game: 'POKER',
          deltaCredits: -Math.floor(Number(buyIn) || 0),
          deltaPoints: 0,
          meta: { type: 'BUY_IN', tableId },
        });
      } catch {}
    }

    this.playerService.join(internal, username, buyIn);

    internal.status = 'WAITING';
    internal.phase = 'WAITING';
    if (!internal.ownerPlayerId) internal.ownerPlayerId = username;
    this.decorateCompetitionQueue(internal);

    await this.repo.save(internal);

    this.chatGateway.emitSystemToTable(tableId, `${username} a rejoint la table`);
    if (this.isCompetition(internal)) {
      await this.tryAutoStartCompetition(internal);
      await this.repo.save(internal);
      this.scheduleCompetitionStart(tableId);
    }
    return toPublic(internal);
  }

  async startGame(tableId: string, username: string): Promise<PokerTablePublic> {
    const table = await this.repo.findOneBy({ id: tableId });
    if (!table) throw new NotFoundException('Table not found');
    const internal = table as any;

    if (internal.mode === 'COMPETITION') {
      throw new BadRequestException('Les tables competition se lancent automatiquement');
    }

    this.gameService.startGame(internal, username);

    if (internal.status !== 'IN_GAME') {
      await this.repo.save(internal);
      return toPublic(internal);
    }

    internal.status = 'IN_GAME';
    internal.startedAt = new Date().toISOString();
    await this.repo.save(internal);

    const sb = internal.smallBlindAmount ?? '—';
    const bb = internal.bigBlindAmount ?? '—';
    const sbP = internal.smallBlindPlayerId ?? '—';
    const bbP = internal.bigBlindPlayerId ?? '—';

    this.chatGateway.emitSystemToTable(tableId, `🎲 La partie commence (${internal.mode})`);
    this.chatGateway.emitSystemToTable(tableId, `Blinds: SB ${sb} (${sbP}) • BB ${bb} (${bbP})`);

    await this.autoProgressCompletedRounds(tableId, internal);
    await this.repo.save(internal);

    return toPublic(internal);
  }

  // ✅ action : bots + auto-advance si <=1 actif
  async action(tableId: string, username: string, action: ActionType, amount?: number): Promise<PokerTablePublic> {
    const table = await this.repo.findOneBy({ id: tableId });
    if (!table) throw new NotFoundException('La table est introuvable');
    const internal = table as any;

    if (internal.status !== 'IN_GAME') throw new BadRequestException('Partie non démarrée');
    if (!internal.players?.includes(username)) throw new ForbiddenException("Vous n'êtes pas assis à cette table");

    this.bettingService.act(internal, username, action, amount);
    this.botService.recordAction(tableId, username, action);

    try {
      this.gameService.autoActBots(internal);
    } catch {}

    await this.autoProgressCompletedRounds(tableId, internal);
    await this.finalizeGameIfOver(tableId, internal);

    await this.repo.save(internal);
    this.chatGateway.emitSystemToTable(tableId, `${username} ${String(action)}${amount != null ? ` ${amount}` : ''}`);

    return toPublic(internal);
  }

  // ✅ Ces endpoints deviennent "robustes" : ils avancent si nécessaire au lieu de throw
  async flop(tableId: string, playerId: string): Promise<PokerTablePublic> {
    const table = await this.repo.findOneBy({ id: tableId });
    if (!table) throw new NotFoundException('La table est introuvable');

    const internal = table as any;
    await this.advanceTo(tableId, internal, 'FLOP');
    await this.autoAdvanceIfTrivial(tableId, internal);

    await this.repo.save(internal);
    return toPublic(internal);
  }

  async turn(tableId: string, playerId: string): Promise<PokerTablePublic> {
    const table = await this.repo.findOneBy({ id: tableId });
    if (!table) throw new NotFoundException('La table est introuvable');

    const internal = table as any;
    await this.advanceTo(tableId, internal, 'TURN');
    await this.autoAdvanceIfTrivial(tableId, internal);

    await this.repo.save(internal);
    return toPublic(internal);
  }

  async river(tableId: string, playerId: string): Promise<PokerTablePublic> {
    const table = await this.repo.findOneBy({ id: tableId });
    if (!table) throw new NotFoundException('La table est introuvable');

    const internal = table as any;
    await this.advanceTo(tableId, internal, 'RIVER');
    await this.autoAdvanceIfTrivial(tableId, internal);

    await this.repo.save(internal);
    return toPublic(internal);
  }

  async endHand(tableId: string, playerId: string): Promise<PokerTablePublic> {
    const table = await this.repo.findOneBy({ id: tableId });
    if (!table) throw new NotFoundException('La table est introuvable');

    const internal = table as any;
    // si le front appelle endHand trop tôt, on déroule tout jusqu'au showdown
    await this.advanceTo(tableId, internal, 'SHOWDOWN');

    await this.repo.save(internal);
    return toPublic(internal);
  }

  // -------------------- END HAND INTERNAL (utilisé par auto-advance) --------------------

  private async endHandInternal(tableId: string, internal: any, ownerId: string): Promise<void> {
    // si déjà showdown, rien à faire
    if (this.phaseOf(internal) === 'SHOWDOWN') return;

    // on appelle la logique du GameService (répartit les pots)
    this.gameService.endHand(internal, ownerId);

    internal.phase = 'SHOWDOWN';
    internal.showdownEndsAt = Date.now() + 3000;

    internal.showdownHands = {};
    for (const pid of internal.players ?? []) {
      const folded = internal.foldedPlayers?.[pid] ?? false;
      const stack = internal.stacks?.[pid] ?? 0;
      if (!folded && stack >= 0) internal.showdownHands[pid] = internal.hands?.[pid] ?? [];
    }

    const winnersRaw: any[] = Array.isArray(internal.lastWinners) ? internal.lastWinners : [];
    const winnerIds: string[] = Array.from(
      new Set(
        winnersRaw
          .map((w: any) => (w?.winnerId != null ? String(w.winnerId) : ''))
          .filter((s: string) => s.length > 0),
      ),
    );

    if (winnerIds.length > 0) {
      const desc = internal.lastWinnerHandDescription ?? winnersRaw[0]?.handDescription ?? '—';

      if (winnerIds.length === 1) {
        const winId = winnerIds[0];
        const totalWin = winnersRaw
          .filter((w: any) => String(w?.winnerId ?? '') === winId)
          .reduce((s: number, w: any) => s + Number(w?.amount ?? 0), 0);

        this.chatGateway.emitSystemToTable(tableId, `🏆 WINNER: ${winId} (+${totalWin}) — ${desc}`);
      } else {
        this.chatGateway.emitSystemToTable(tableId, `🤝 SPLIT POT: ${winnerIds.join(', ')} — ${desc}`);
      }

      this.recordCompetitionEliminations(internal);
    }

    this.chatGateway.emitSystemToTable(tableId, `🟡 SHOWDOWN (3s)…`);

    setTimeout(async () => {
      try {
        const fresh = await this.repo.findOneBy({ id: tableId });
        if (!fresh) return;

        const t = fresh as any;
        if (String(t.phase || '').toUpperCase() !== 'SHOWDOWN') return;
        if (!t.showdownEndsAt || Date.now() < t.showdownEndsAt) return;

        t.showdownHands = undefined;
        t.showdownEndsAt = undefined;

        // ✅ NEW : fin de partie + cashout si 1 seul stack > 0
        this.recordCompetitionEliminations(t);
        const ended = await this.finalizeGameIfOver(tableId, t);
        if (ended) {
          await this.repo.save(t);
          return;
        }

        this.gameService.startNewHand(t);
        await this.repo.save(t);

        this.chatGateway.emitSystemToTable(tableId, `▶️ Nouvelle main`);
      } catch {
        // ignore
      }
    }, 3100);
  }

  async leave(tableId: string, playerId: string): Promise<{ tableDeleted: boolean; table: PokerTablePublic | null }> {
    const table = await this.repo.findOneBy({ id: tableId });
    if (!table) throw new NotFoundException('La table est introuvable');

    const internal = table as any;

    if (this.isCompetition(internal) && internal.status === 'IN_GAME') {
      internal.stacks ??= {};
      internal.foldedPlayers ??= {};
      internal.hasActed ??= {};

      internal.stacks[playerId] = 0;
      internal.foldedPlayers[playerId] = true;
      internal.hasActed[playerId] = true;
      this.recordCompetitionEliminations(internal);

      const ended = await this.finalizeGameIfOver(tableId, internal);
      await this.repo.save(internal);

      this.chatGateway.emitSystemToTable(
        tableId,
        ended ? `${playerId} est elimine de la competition` : `${playerId} a quitte et est elimine de la competition`,
      );

      return { tableDeleted: false, table: toPublic(internal) };
    }

    this.playerService.leave(internal, playerId);

    const humans = (internal.players ?? []).filter((p: string) => !this.isBotId(p));
    if (humans.length === 0) {
      await this.deleteTable(internal.id);
      return { tableDeleted: true, table: null };
    }

    await this.repo.save(internal);
    this.chatGateway.emitSystemToTable(tableId, `${playerId} a quitté la table`);
    return { tableDeleted: false, table: toPublic(internal) };
  }

  async getPlayerHandSecure(tableId: string, username: string) {
    const table = await this.repo.findOneBy({ id: this.normalizeCode(tableId) });
    if (!table) throw new NotFoundException('La table est introuvable');

    const internal = table as any;
    if (!internal.players?.includes(username)) throw new ForbiddenException("Vous n'êtes pas assis à cette table");

    return internal.hands?.[username] ?? [];
  }

  // -------------------- BEST HAND (toute la partie) --------------------

  private combinationsOf5<T>(arr: T[]): T[][] {
    const res: T[][] = [];
    const n = arr.length;
    for (let a = 0; a < n - 4; a++) {
      for (let b = a + 1; b < n - 3; b++) {
        for (let c = b + 1; c < n - 2; c++) {
          for (let d = c + 1; d < n - 1; d++) {
            for (let e = d + 1; e < n; e++) {
              res.push([arr[a], arr[b], arr[c], arr[d], arr[e]]);
            }
          }
        }
      }
    }
    return res;
  }

  private fallbackDesc(cards: Card[]): { description: string; winningCards: Card[] } {
    const ranks = cards.map((c) => String(c?.rank ?? '').toUpperCase()).filter(Boolean);
    if (!ranks.length) return { description: '—', winningCards: [] };

    const counts: Record<string, number> = {};
    for (const r of ranks) counts[r] = (counts[r] ?? 0) + 1;

    const hiOrder = ['A','K','Q','J','10','9','8','7','6','5','4','3','2'];

    const byCountDesc = Object.entries(counts)
      .map(([r, n]) => ({ r, n }))
      .sort((x, y) => (y.n - x.n) || (hiOrder.indexOf(x.r) - hiOrder.indexOf(y.r)));

    const top = byCountDesc[0];
    const second = byCountDesc[1];

    if (top?.n === 4) return { description: `Carré de ${top.r}`, winningCards: [] };
    if (top?.n === 3 && second?.n === 2) return { description: `Full ${top.r} par ${second.r}`, winningCards: [] };
    if (top?.n === 3) return { description: `Brelan de ${top.r}`, winningCards: [] };
    if (top?.n === 2 && second?.n === 2) return { description: `Double paire (${top.r} et ${second.r})`, winningCards: [] };
    if (top?.n === 2) return { description: `Paire de ${top.r}`, winningCards: [] };

    const high = ranks.sort((a, b) => hiOrder.indexOf(a) - hiOrder.indexOf(b))[0] ?? ranks[0];
    return { description: `Carte haute ${high}`, winningCards: [] };
  }

  async getBestHandForPlayer(tableId: string, username: string) {
    const table = await this.repo.findOneBy({ id: this.normalizeCode(tableId) });
    if (!table) throw new NotFoundException('La table est introuvable');

    const t = table as any;
    if (!t.players?.includes(username)) throw new ForbiddenException("Vous n'êtes pas assis à cette table");

    const hand: Card[] = t.hands?.[username] ?? [];
    const board: Card[] = t.communityCards ?? [];
    const cards: Card[] = [...hand, ...board];

    if (cards.length < 5) {
      const fb = this.fallbackDesc(cards);
      return { description: fb.description, winningCards: fb.winningCards };
    }

    if (cards.length === 5 || cards.length === 6) {
      const combos = this.combinationsOf5(cards);
      let best: any = null;
      for (const five of combos) {
        const score = this.handEvaluator.evaluate5(five as any);
        if (!best || this.handEvaluator.compareScores(score, best) < 0) best = score;
      }
      return { description: best?.description ?? '—', winningCards: best?.winningCards ?? [] };
    }

    if (cards.length >= 7) {
      try {
        const score = this.handEvaluator.bestHandOf7(cards.slice(0, 7) as any);
        return { description: score?.description ?? '—', winningCards: score?.winningCards ?? [] };
      } catch {
        const fb = this.fallbackDesc(cards);
        return { description: fb.description, winningCards: fb.winningCards };
      }
    }

    const fb = this.fallbackDesc(cards);
    return { description: fb.description, winningCards: fb.winningCards };
  }

  async getShowdown(tableId: string, username: string) {
    const table = await this.repo.findOneBy({ id: this.normalizeCode(tableId) });
    if (!table) throw new NotFoundException('La table est introuvable');

    const t = table as any;
    if (!t.players?.includes(username)) throw new ForbiddenException("Vous n'êtes pas assis à cette table");

    if (String(t.phase || '').toUpperCase() !== 'SHOWDOWN') return {};
    return t.showdownHands ?? {};
  }
}
