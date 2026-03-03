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
import { UsersService } from '../../users/users.service';
import { ChatGateway } from './chat/chat.gateway';
import { HandEvaluatorService } from './services/hand-evaluator.service';

import { StatsService } from '../stats/stats.service';

type Card = { rank: string; suit: string };

type Street = 'PRE_FLOP' | 'FLOP' | 'TURN' | 'RIVER' | 'SHOWDOWN' | 'WAITING';

@Injectable()
export class TablesService {
  private readonly COMP_WIN_POINTS = 20;

  constructor(
    @InjectRepository(PokerTableEntity)
    private readonly repo: Repository<PokerTableEntity>,
    private readonly playerService: PlayerService,
    private readonly gameService: GameService,
    private readonly bettingService: BettingService,
    private readonly tableResetService: TableResetService,
    private readonly usersService: UsersService,
    private readonly chatGateway: ChatGateway,
    private readonly handEvaluator: HandEvaluatorService,
    private readonly statsService: StatsService,
  ) {}

  private generateTableCode6(): string {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let out = '';
    for (let i = 0; i < 6; i++) out += letters[Math.floor(Math.random() * letters.length)];
    return out;
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

  // -------------------- FIN / CASHOUT --------------------

  private async finalizeGameIfOver(tableId: string, internal: any): Promise<boolean> {
    const alive = this.getAliveStacks(internal);
    if (alive.length !== 1) return false;

    const winnerId = alive[0];
    const winnerStack = Number(internal.stacks?.[winnerId] ?? 0);

    if (winnerStack > 0 && !this.isBotId(winnerId)) {
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

    internal.status = 'WAITING';
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

    internal.lastWinners = undefined;
    internal.lastWinnerId = undefined;
    internal.lastWinnerHand = undefined;
    internal.lastWinnerHandDescription = undefined;

    this.chatGateway.emitSystemToTable(tableId, `🏁 Partie terminée (un seul joueur a encore du stack).`);
    return true;
  }

  // -------------------- CRUD / GAME --------------------

  async findOne(id: string): Promise<PokerTablePublic> {
    const table = await this.repo.findOneBy({ id: this.normalizeCode(id) });
    if (!table) throw new NotFoundException('La table est introuvable');
    return toPublic(table as any);
  }

  async listPublicTables(): Promise<PokerTablePublic[]> {
    const tables = await this.repo.find({ where: { visibility: 'PUBLIC' as any } });
    return tables
      .filter((t: any) => (t.status ?? '') !== 'DELETED')
      .map((t) => toPublic(t as any));
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
    if (mode === 'COMPETITION') visibility = 'PUBLIC';

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

    await this.repo.save(table);

    const joined = await this.join(tableId, ownerUsername);
    return { tableId, table: joined };
  }

  async joinPublic(tableId: string, username: string): Promise<PokerTablePublic> {
    const id = this.normalizeCode(tableId);
    const table = await this.repo.findOneBy({ id });
    if (!table) throw new NotFoundException('La table est introuvable');
    if ((table.visibility ?? 'PRIVATE') !== 'PUBLIC') throw new BadRequestException('Cette table est privée (code requis)');
    return this.join(id, username);
  }

  async joinByCode(code: string, username: string): Promise<PokerTablePublic> {
    const normalized = this.normalizeCode(code);
    if (!/^[A-Z]{6}$/.test(normalized)) throw new BadRequestException('Code invalide (6 lettres A-Z)');
    const t = await this.repo.findOneBy({ id: normalized });
    if (!t) throw new NotFoundException('La table est introuvable');
    return this.join(normalized, username);
  }

  async join(tableId: string, username: string): Promise<PokerTablePublic> {
    if (!username || username.trim().length === 0) throw new BadRequestException('username requis');

    const table = await this.repo.findOneBy({ id: tableId });
    if (!table) throw new NotFoundException('La table est introuvable');
    const internal = table as any;

    if (internal.status === 'IN_GAME') throw new BadRequestException('Partie en cours, impossible de rejoindre');
    if (internal.players?.includes(username)) return toPublic(internal);
    if (internal.players.length >= internal.maxPlayers) throw new BadRequestException('la table est pleine');

    const buyIn = internal.buyInAmount;

    await this.usersService.debitCreditsByUsername(username, buyIn);

    try {
      await this.statsService.recordEvent(username, {
        game: 'POKER',
        deltaCredits: -Math.floor(Number(buyIn) || 0),
        deltaPoints: 0,
        meta: { type: 'BUY_IN', tableId },
      });
    } catch {}

    this.playerService.join(internal, username, buyIn);

    internal.status = 'WAITING';
    internal.phase = 'WAITING';
    if (!internal.ownerPlayerId) internal.ownerPlayerId = username;

    await this.repo.save(internal);

    this.chatGateway.emitSystemToTable(tableId, `${username} a rejoint la table`);
    return toPublic(internal);
  }

  async startGame(tableId: string, username: string): Promise<PokerTablePublic> {
    const table = await this.repo.findOneBy({ id: tableId });
    if (!table) throw new NotFoundException('Table not found');
    const internal = table as any;

    if (internal.mode === 'COMPETITION') {
      const humans = this.humanCount(internal.players ?? []);
      if (humans < 4) throw new BadRequestException('Mode compétition: minimum 4 joueurs humains requis');
      internal.fillWithBots = false;
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

    // ✅ si déjà trivial (ex: 1 joueur actif), on auto-advance
    await this.autoAdvanceIfTrivial(tableId, internal);
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

    try {
      this.gameService.autoActBots(internal);
    } catch {}

    // ✅ si 0/1 joueur actif : on déroule automatiquement flop/turn/river/end-hand
    await this.autoAdvanceIfTrivial(tableId, internal);

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

      if (String(internal.mode || '').toUpperCase() === 'COMPETITION') {
        for (const wid of winnerIds) {
          if (!wid || this.isBotId(wid)) continue;

          try {
            await this.usersService.addPointsByUsername(wid, this.COMP_WIN_POINTS);
            await this.statsService.recordEvent(wid, {
              game: 'POKER',
              deltaCredits: 0,
              deltaPoints: this.COMP_WIN_POINTS,
              meta: { type: 'COMP_WIN', tableId },
            });
          } catch {}
        }
      }
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
    this.playerService.leave(internal, playerId);

    const humans = (internal.players ?? []).filter((p: string) => !this.isBotId(p));
    if (humans.length === 0) {
      await this.repo.delete({ id: internal.id });
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