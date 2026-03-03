// src/games/blackjack/blackjack.service.ts

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";

import { UsersService } from "../../users/users.service";
import { BlackjackTable } from "./entities/blackjack-table.entity";
import { BlackjackTablePlayer } from "./entities/blackjack-table-player.entity";
import { BlackjackGame } from "./entities/blackjack-game.entity";
import type { JwtUser } from "../../auth/jwt.strategy";
import { BlackjackChatGateway } from "./blackjack-chat.gateway";
import { StatsService } from "../stats/stats.service";

const NEXT_ROUND_DELAY_MS = 5000; // ⏱️ temps pour voir les mains avant next round

type Suit = "S" | "H" | "D" | "C";
type Rank =
  | "A"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K";
type Card = { suit: Suit; rank: Rank };

type PlayerRoundStatus =
  | "waiting"
  | "playing"
  | "stand"
  | "bust"
  | "blackjack"
  | "done";

type PlayerRoundState = {
  userId: number;
  username: string;
  bet: number;
  cards: Card[];
  status: PlayerRoundStatus;
};

type GamePhase = "betting" | "player_turns" | "dealer_turn" | "finished";

type RoundResult = {
  winners: string[]; // usernames gagnants (sans dealer)
  netWins: Record<string, number>; // username -> gain net
  message: string; // message lisible
};

type GameState = {
  round: number;
  phase: GamePhase;

  shoe: Card[]; // jamais renvoyé au client
  dealer: { cards: Card[]; value: number };

  turnOrder: number[];
  currentTurnIndex: number;

  players: Record<string, PlayerRoundState>;
  waitingPlayers: number[];

  roundResult: RoundResult | null;
};

@Injectable()
export class BlackjackService {
  constructor(
    @InjectRepository(BlackjackTable)
    private tablesRepo: Repository<BlackjackTable>,
    @InjectRepository(BlackjackTablePlayer)
    private playersRepo: Repository<BlackjackTablePlayer>,
    @InjectRepository(BlackjackGame)
    private gamesRepo: Repository<BlackjackGame>,
    private readonly usersService: UsersService,
    private readonly dataSource: DataSource,
    private readonly blackjackChatGateway: BlackjackChatGateway,
    private readonly statsService: StatsService
  ) {}

  // ============================================================
  // Helpers Table Code
  // ============================================================
  private normalizeCode(code: string): string {
    return String(code ?? "").trim().toUpperCase();
  }

  private generateTableCode(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  private async generateUniqueTableCode(): Promise<string> {
    while (true) {
      const code = this.generateTableCode();
      const exists = await this.tablesRepo.exist({ where: { code } as any });
      if (!exists) return code;
    }
  }

  private ensureOwner(table: BlackjackTable, jwt: JwtUser) {
    if (table.ownerId !== jwt.userId) {
      throw new ForbiddenException("ONLY_OWNER_CAN_DO_THIS");
    }
  }

  // ============================================================
  // Cards / Shoe / Values
  // ============================================================
  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  private buildShoeSixDecks(): Card[] {
    const suits: Suit[] = ["S", "H", "D", "C"];
    const ranks: Rank[] = [
      "A",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "J",
      "Q",
      "K",
    ];

    const oneDeck: Card[] = [];
    for (const s of suits) for (const r of ranks) oneDeck.push({ suit: s, rank: r });

    const shoe: Card[] = [];
    for (let i = 0; i < 6; i++) shoe.push(...oneDeck);
    return this.shuffle(shoe);
  }

  // ✅ J/Q/K=10, A=11 puis ajusté
  private cardValue(rank: Rank): number {
    if (rank === "A") return 11;
    if (rank === "K" || rank === "Q" || rank === "J") return 10;
    return Number(rank);
  }

  // ✅ A = 11 ou 1 selon ce qui arrange
  private handValue(cards: Card[]): number {
    let total = 0;
    let aces = 0;

    for (const c of cards) {
      total += this.cardValue(c.rank);
      if (c.rank === "A") aces++;
    }

    while (total > 21 && aces > 0) {
      total -= 10;
      aces--;
    }
    return total;
  }

  private isBlackjackTwoCards(cards: Card[]): boolean {
    return cards.length === 2 && this.handValue(cards) === 21;
  }

  private draw(state: GameState): Card {
    if (state.shoe.length === 0) {
      state.shoe = this.buildShoeSixDecks();
    }
    return state.shoe.shift()!;
  }

  // ============================================================
  // Game State storage
  // ============================================================
  private makeInitialState(): GameState {
    return {
      round: 0,
      phase: "betting",
      shoe: this.buildShoeSixDecks(),
      dealer: { cards: [], value: 0 },
      turnOrder: [],
      currentTurnIndex: 0,
      players: {},
      waitingPlayers: [],
      roundResult: null,
    };
  }

  private parseState(game: BlackjackGame): GameState {
    try {
      const s = JSON.parse(game.stateJson) as GameState;
      // harden si vieilles données en DB
      if (!("roundResult" in (s as any))) (s as any).roundResult = null;
      return s;
    } catch {
      throw new BadRequestException("CORRUPTED_GAME_STATE");
    }
  }

  private async saveState(game: BlackjackGame, state: GameState) {
    game.stateJson = JSON.stringify(state);
    await this.gamesRepo.save(game);
  }

  private async getOrCreateGame(tableId: string): Promise<BlackjackGame> {
    let game = await this.gamesRepo.findOne({ where: { tableId } as any });
    if (!game) {
      game = this.gamesRepo.create({
        tableId,
        stateJson: JSON.stringify(this.makeInitialState()),
      });
      game = await this.gamesRepo.save(game);
    }
    return game;
  }

  private async getTableByCodeOrThrow(code: string) {
    const normalized = this.normalizeCode(code);
    const table = await this.tablesRepo.findOne({
      where: { code: normalized } as any,
      relations: ["players"],
    });
    if (!table) throw new NotFoundException("TABLE_NOT_FOUND");
    return { table, normalized };
  }

  // ✅ masque le shoe + value par joueur + résultat complet
  private sanitizeStateForClient(state: GameState | null): any {
    if (!state) return null;

    const playersWithValue: Record<string, any> = {};
    for (const [k, p] of Object.entries(state.players)) {
      playersWithValue[k] = {
        ...p,
        value: this.handValue(p.cards),
      };
    }

    return {
      round: state.round,
      phase: state.phase,
      dealer: state.dealer,
      turnOrder: state.turnOrder,
      currentTurnIndex: state.currentTurnIndex,
      players: playersWithValue,
      waitingPlayers: state.waitingPlayers,
      roundResult: state.roundResult,
    };
  }

  // ============================================================
  // Lobby / Tables
  // ============================================================
  async listTables() {
    return this.tablesRepo.find({
      order: { createdAt: "DESC" } as any,
      relations: ["players"],
    });
  }

  async getTableByCode(code: string) {
    const { table } = await this.getTableByCodeOrThrow(code);
    return table;
  }

  // ✅ CREATE TABLE (génère code 6 lettres)
  async createTable(dto: any, jwt: JwtUser) {
    const user = await this.usersService.findByUsername(jwt.username);
    if (!user) throw new NotFoundException("USER_NOT_FOUND");

    const name = String(dto.name ?? "").trim();
    if (name.length < 2) throw new BadRequestException("INVALID_NAME");

    const maxPlayers = Math.min(6, Math.max(1, Number(dto.maxPlayers ?? 6)));

    const minBet = Number(dto.minBet);
    if (!Number.isFinite(minBet) || minBet < 1) throw new BadRequestException("INVALID_MIN_BET");

    const tableMaxBet =
      dto.tableMaxBet === undefined || dto.tableMaxBet === null
        ? null
        : Number(dto.tableMaxBet);

    if (tableMaxBet !== null) {
      if (!Number.isFinite(tableMaxBet) || tableMaxBet < 1)
        throw new BadRequestException("INVALID_TABLE_MAX_BET");
      if (tableMaxBet < minBet) throw new BadRequestException("TABLE_MAX_BET_TOO_LOW");
    }

    return this.dataSource.transaction(async (manager) => {
      const tablesRepo = manager.getRepository(BlackjackTable);
      const playersRepo = manager.getRepository(BlackjackTablePlayer);
      const gamesRepo = manager.getRepository(BlackjackGame);

      let code = await this.generateUniqueTableCode();

      const table = tablesRepo.create({
        code,
        name,
        maxPlayers,
        minBet,
        tableMaxBet,
        status: "lobby" as any,
        ownerId: jwt.userId,
      });

      try {
        await tablesRepo.save(table);
      } catch {
        code = await this.generateUniqueTableCode();
        table.code = code;
        await tablesRepo.save(table);
      }

      // auto-join owner
      await playersRepo.save(
        playersRepo.create({
          tableId: table.id,
          userId: jwt.userId,
          username: user.username,
        })
      );

      // init game state
      await gamesRepo.save(
        gamesRepo.create({
          tableId: table.id,
          stateJson: JSON.stringify(this.makeInitialState()),
        })
      );

      const full = await tablesRepo.findOne({
        where: { id: table.id } as any,
        relations: ["players"],
      });

      return full ?? table;
    });
  }

  // ✅ join autorisé même si in_game (attend prochain tour)
  async joinTableByCode(code: string, jwt: JwtUser) {
    return this.dataSource.transaction(async (manager) => {
      const tablesRepo = manager.getRepository(BlackjackTable);
      const playersRepo = manager.getRepository(BlackjackTablePlayer);
      const gamesRepo = manager.getRepository(BlackjackGame);

      const normalized = this.normalizeCode(code);
      const table = await tablesRepo.findOne({ where: { code: normalized } as any });
      if (!table) throw new NotFoundException("TABLE_NOT_FOUND");

      if (table.status !== "waiting" && table.status !== "in_game") {
        throw new BadRequestException("TABLE_NOT_JOINABLE");
      }

      const existing = await playersRepo.findOne({
        where: { tableId: table.id, userId: jwt.userId } as any,
      });
      if (existing) return this.getStateByCode(normalized, jwt);

      const count = await playersRepo.count({ where: { tableId: table.id } as any });
      if (count >= table.maxPlayers) throw new BadRequestException("TABLE_FULL");

      const user = await this.usersService.findByUsername(jwt.username);
      if (!user) throw new NotFoundException("USER_NOT_FOUND");

      await playersRepo.save(
        playersRepo.create({
          tableId: table.id,
          userId: jwt.userId,
          username: user.username,
        })
      );

      // si partie en cours => waitingPlayers
      const game = await gamesRepo.findOne({ where: { tableId: table.id } as any });
      if (game) {
        const state = this.parseState(game);

        if (!state.players[String(jwt.userId)]) {
          state.players[String(jwt.userId)] = {
            userId: jwt.userId,
            username: user.username,
            bet: 0,
            cards: [],
            status: "waiting",
          };
        }

        if (table.status === "in_game" && !state.waitingPlayers.includes(jwt.userId)) {
          state.waitingPlayers.push(jwt.userId);
          state.players[String(jwt.userId)].status = "waiting";
        }

        game.stateJson = JSON.stringify(state);
        await gamesRepo.save(game);
      }

      return this.getStateByCode(normalized, jwt);
    });
  }

  async leaveTableByCode(code: string, jwt: JwtUser) {
    return this.dataSource.transaction(async (manager) => {
      const tablesRepo = manager.getRepository(BlackjackTable);
      const playersRepo = manager.getRepository(BlackjackTablePlayer);
      const gamesRepo = manager.getRepository(BlackjackGame);

      const normalized = this.normalizeCode(code);
      const table = await tablesRepo.findOne({ where: { code: normalized } as any });
      if (!table) throw new NotFoundException("TABLE_NOT_FOUND");

      await playersRepo.delete({ tableId: table.id, userId: jwt.userId } as any);

      const game = await gamesRepo.findOne({ where: { tableId: table.id } as any });
      if (game) {
        const state = this.parseState(game);

        state.waitingPlayers = state.waitingPlayers.filter((id) => id !== jwt.userId);
        delete state.players[String(jwt.userId)];
        state.turnOrder = state.turnOrder.filter((id) => id !== jwt.userId);

        if (!state.turnOrder[state.currentTurnIndex]) state.currentTurnIndex = 0;

        game.stateJson = JSON.stringify(state);
        await gamesRepo.save(game);
      }

      const remaining = await playersRepo.find({
        where: { tableId: table.id } as any,
        order: { joinedAt: "ASC" } as any,
      });

      if (remaining.length === 0) {
        await tablesRepo.delete({ id: table.id } as any);
        if (game) await gamesRepo.delete({ tableId: table.id } as any);
        return { deleted: true };
      }

      if (table.ownerId === jwt.userId) {
        table.ownerId = remaining[0].userId;
        await tablesRepo.save(table);
      }

      return this.getStateByCode(normalized, jwt);
    });
  }

  // ============================================================
  // Gameplay
  // ============================================================

  async startGameByCode(code: string, jwt: JwtUser) {
    const { table, normalized } = await this.getTableByCodeOrThrow(code);
    this.ensureOwner(table, jwt);

    return this.dataSource.transaction(async (manager) => {
      const tablesRepo = manager.getRepository(BlackjackTable);
      const tablePlayersRepo = manager.getRepository(BlackjackTablePlayer);

      table.status = "in_game" as any;
      await tablesRepo.save(table);

      const game = await this.getOrCreateGame(table.id);
      const state = this.parseState(game);

      state.round = Math.max(1, state.round + 1);
      state.phase = "betting";
      state.dealer = { cards: [], value: 0 };
      state.turnOrder = [];
      state.currentTurnIndex = 0;
      state.roundResult = null;

      const seated = await tablePlayersRepo.find({
        where: { tableId: table.id } as any,
        order: { joinedAt: "ASC" } as any,
      });

      for (const p of seated) {
        if (!state.players[String(p.userId)]) {
          state.players[String(p.userId)] = {
            userId: p.userId,
            username: p.username,
            bet: 0,
            cards: [],
            status: "waiting",
          };
        } else {
          state.players[String(p.userId)].bet = 0;
          state.players[String(p.userId)].cards = [];
          state.players[String(p.userId)].status = "waiting";
        }
      }

      state.waitingPlayers = [];

      await this.saveState(game, state);

      this.blackjackChatGateway.emitSystemToTable(
        normalized,
        `Round #${state.round} - placez vos mises.`
      );

      return this.getStateByCode(normalized, jwt);
    });
  }

  private async maybeAutoDealAfterBet(
    tableCode: string,
    table: BlackjackTable,
    seated: BlackjackTablePlayer[],
    game: BlackjackGame,
    state: GameState
  ) {
    if (state.phase !== "betting") return;

    const eligible = seated.map((p) => p.userId).filter((uid) => !state.waitingPlayers.includes(uid));
    if (eligible.length === 0) return;

    const allBet = eligible.every((uid) => {
      const ps = state.players[String(uid)];
      return ps && ps.bet > 0;
    });
    if (!allBet) return;

    const active = [...eligible];

    state.dealer.cards = [];
    state.dealer.value = 0;
    state.roundResult = null;

    for (const uid of active) {
      state.players[String(uid)].cards = [];
      state.players[String(uid)].status = "playing";
    }

    state.turnOrder = active;
    state.currentTurnIndex = 0;

    // deal order
    for (const uid of state.turnOrder) state.players[String(uid)].cards.push(this.draw(state));
    state.dealer.cards.push(this.draw(state));
    for (const uid of state.turnOrder) state.players[String(uid)].cards.push(this.draw(state));
    state.dealer.cards.push(this.draw(state));

    // blackjack auto-skip
    for (const uid of state.turnOrder) {
      const p = state.players[String(uid)];
      if (this.isBlackjackTwoCards(p.cards)) {
        p.status = "blackjack";
        this.blackjackChatGateway.emitSystemToTable(tableCode, `${p.username} a BLACKJACK !`);
      }
    }

    state.dealer.value = this.handValue(state.dealer.cards);

    const dealerBJ = this.isBlackjackTwoCards(state.dealer.cards);
    if (dealerBJ) {
      this.blackjackChatGateway.emitSystemToTable(tableCode, `Le croupier a BLACKJACK !`);

      state.phase = "finished";
      await this.resolvePayouts(state, tableCode);
      await this.saveState(game, state);

      this.emitRoundResultMessage(tableCode, state);

      this.scheduleNextRound(tableCode, game.id);
      return;
    }

    state.phase = "player_turns";

    const nextPhase = this.advanceTurnToNextPlayable(state);

    // si personne jouable => dealer + resolve direct
    if (nextPhase === "dealer_turn") {
      this.playDealer(state);
      await this.resolvePayouts(state, tableCode);
      state.phase = "finished";

      await this.saveState(game, state);

      this.emitRoundResultMessage(tableCode, state);

      this.scheduleNextRound(tableCode, game.id);
      return;
    }

    await this.saveState(game, state);

    const curUid = state.turnOrder[state.currentTurnIndex];
    const cur = curUid ? state.players[String(curUid)] : null;
    if (cur) this.blackjackChatGateway.emitSystemToTable(tableCode, `Au tour de ${cur.username}.`);
  }

  async placeBetByCode(code: string, amount: number, jwt: JwtUser) {
    const { table, normalized } = await this.getTableByCodeOrThrow(code);
    if (table.status !== "in_game") throw new BadRequestException("GAME_NOT_STARTED");

    return this.dataSource.transaction(async (manager) => {
      const tablePlayersRepo = manager.getRepository(BlackjackTablePlayer);

      const seated = await tablePlayersRepo.find({
        where: { tableId: table.id } as any,
        order: { joinedAt: "ASC" } as any,
      });

      const isSeated = seated.some((p) => p.userId === jwt.userId);
      if (!isSeated) throw new BadRequestException("NOT_IN_TABLE");

      const game = await this.getOrCreateGame(table.id);
      const state = this.parseState(game);

      if (state.phase !== "betting") throw new BadRequestException("NOT_IN_BETTING_PHASE");
      if (state.waitingPlayers.includes(jwt.userId)) throw new BadRequestException("WAIT_NEXT_ROUND_TO_BET");

      const minBet = Number(table.minBet);
      const maxBet = table.tableMaxBet ?? null;

      if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException("INVALID_BET");
      if (amount < minBet) throw new BadRequestException("BET_TOO_LOW");
      if (maxBet !== null && amount > Number(maxBet)) throw new BadRequestException("BET_TOO_HIGH");

      const ps =
        state.players[String(jwt.userId)] ?? {
          userId: jwt.userId,
          username: jwt.username,
          bet: 0,
          cards: [],
          status: "waiting" as PlayerRoundStatus,
        };

      if (ps.bet > 0) throw new BadRequestException("BET_ALREADY_PLACED");

      await this.usersService.debitCreditsByUsername(jwt.username, amount);

      ps.bet = amount;
      ps.cards = [];
      ps.status = "playing";
      state.players[String(jwt.userId)] = ps;

      await this.saveState(game, state);

      this.blackjackChatGateway.emitSystemToTable(normalized, `${ps.username} mise ${amount} crédits.`);

      await this.maybeAutoDealAfterBet(normalized, table, seated, game, state);

      return this.getStateByCode(normalized, jwt);
    });
  }

  async playerActionByCode(code: string, action: "hit" | "stand", jwt: JwtUser) {
    const { table, normalized } = await this.getTableByCodeOrThrow(code);
    if (table.status !== "in_game") throw new BadRequestException("GAME_NOT_STARTED");

    return this.dataSource.transaction(async () => {
      const game = await this.getOrCreateGame(table.id);
      const state = this.parseState(game);

      if (state.phase !== "player_turns") {
        throw new BadRequestException("NOT_IN_PLAYER_TURNS");
      }

      const currentId = state.turnOrder[state.currentTurnIndex];
      if (!currentId) throw new BadRequestException("NO_CURRENT_PLAYER");
      if (currentId !== jwt.userId) throw new ForbiddenException("NOT_YOUR_TURN");

      const ps = state.players[String(jwt.userId)];
      if (!ps || ps.bet <= 0) throw new BadRequestException("YOU_ARE_NOT_ACTIVE_THIS_ROUND");

      // blackjack -> skip auto
      if (ps.status === "blackjack") {
        const nextPhaseSkip = this.advanceTurnToNextPlayable(state);
        await this.saveState(game, state);

        if (nextPhaseSkip === "dealer_turn") {
          this.playDealer(state);
          await this.resolvePayouts(state, normalized);
          state.phase = "finished";
          await this.saveState(game, state);

          this.emitRoundResultMessage(normalized, state);
          this.scheduleNextRound(normalized, game.id);
        }
        return this.getStateByCode(normalized, jwt);
      }

      if (ps.status !== "playing") throw new BadRequestException("YOU_CANNOT_ACT");

      if (action === "hit") {
        ps.cards.push(this.draw(state));
        const v = this.handValue(ps.cards);
        this.blackjackChatGateway.emitSystemToTable(normalized, `${ps.username} HIT (${v}).`);

        if (v > 21) {
          ps.status = "bust";
          this.blackjackChatGateway.emitSystemToTable(normalized, `${ps.username} BUST (${v}).`);
        }
      } else {
        ps.status = "stand";
        const v = this.handValue(ps.cards);
        this.blackjackChatGateway.emitSystemToTable(normalized, `${ps.username} STAND (${v}).`);
      }

      state.players[String(jwt.userId)] = ps;
      state.dealer.value = this.handValue(state.dealer.cards);

      const nextPhase = this.advanceTurnToNextPlayable(state);

      if (nextPhase === "dealer_turn") {
        this.playDealer(state);
        await this.resolvePayouts(state, normalized);
        state.phase = "finished";

        await this.saveState(game, state);

        this.emitRoundResultMessage(normalized, state);
        this.scheduleNextRound(normalized, game.id);
      } else {
        await this.saveState(game, state);

        const nextUid = state.turnOrder[state.currentTurnIndex];
        const nextPlayer = nextUid ? state.players[String(nextUid)] : null;
        if (nextPlayer) {
          this.blackjackChatGateway.emitSystemToTable(normalized, `Au tour de ${nextPlayer.username}.`);
        }
      }

      return this.getStateByCode(normalized, jwt);
    });
  }

  async getStateByCode(code: string, jwt: JwtUser) {
    const { table, normalized } = await this.getTableByCodeOrThrow(code);
    const game = await this.gamesRepo.findOne({ where: { tableId: table.id } as any });
    const state = game ? this.parseState(game) : null;

    return {
      tableCode: normalized,
      table: {
        code: table.code,
        name: table.name,
        status: table.status,
        ownerId: table.ownerId,
        minBet: table.minBet,
        tableMaxBet: table.tableMaxBet,
        maxPlayers: table.maxPlayers,
        players: (table.players ?? []).map((p) => ({
          userId: p.userId,
          username: p.username,
          joinedAt: p.joinedAt,
        })),
      },
      game: this.sanitizeStateForClient(state),
      you: { userId: jwt.userId, username: jwt.username },
    };
  }

  // ============================================================
  // Turn handling
  // ============================================================
  private advanceTurnToNextPlayable(state: GameState): GamePhase {
    const isPlayable = (uid: number) => {
      const ps = state.players[String(uid)];
      if (!ps) return false;
      if (ps.bet <= 0) return false;
      return ps.status === "playing";
    };

    const currentId = state.turnOrder[state.currentTurnIndex];
    if (currentId && isPlayable(currentId)) {
      state.phase = "player_turns";
      return state.phase;
    }

    let idx = state.currentTurnIndex;
    for (let step = 0; step < state.turnOrder.length; step++) {
      idx += 1;
      if (idx >= state.turnOrder.length) break;

      const uid = state.turnOrder[idx];
      if (isPlayable(uid)) {
        state.currentTurnIndex = idx;
        state.phase = "player_turns";
        return state.phase;
      }
    }

    state.phase = "dealer_turn";
    return state.phase;
  }

  private playDealer(state: GameState) {
    let v = this.handValue(state.dealer.cards);
    while (v < 17) {
      state.dealer.cards.push(this.draw(state));
      v = this.handValue(state.dealer.cards);
    }
    state.dealer.value = v;
  }

  // ============================================================
  // Payouts + roundResult (typed)
  // ============================================================
  private async resolvePayouts(state: GameState, tableCode?: string) {
    const dealerValue = this.handValue(state.dealer.cards);
    const dealerBust = dealerValue > 21;
    const dealerBJ = this.isBlackjackTwoCards(state.dealer.cards);

    const winners: string[] = [];
    const netWins: Record<string, number> = {};

    for (const uid of state.turnOrder) {
      const ps = state.players[String(uid)];
      if (!ps || ps.bet <= 0) continue;

      const playerValue = this.handValue(ps.cards);
      const playerBust = playerValue > 21;
      const playerBJ = this.isBlackjackTwoCards(ps.cards);

      let payout = 0;

      if (dealerBJ && !playerBJ) payout = 0;
      else if (playerBust) payout = 0;
      else if (dealerBust) payout = ps.bet * 2;
      else if (playerValue === dealerValue) payout = ps.bet;
      else if (playerValue > dealerValue) payout = playerBJ ? Math.floor(ps.bet * 2.5) : ps.bet * 2;
      else payout = 0;

      if (payout > 0) {
        await this.usersService.creditCreditsByUsername(ps.username, payout);
      }

      const net = payout - ps.bet;
      netWins[ps.username] = net;
      if (net > 0) winners.push(ps.username);

      // 📈 Stats dashboard (gain/perte net)
      try {
        this.statsService.recordEvent(ps.username, {
          game: "BLACKJACK",
          deltaCredits: net,
          meta: {
            tableCode: tableCode ?? null,
            round: state.round,
            won: net > 0,
            noHit: Array.isArray(ps.cards) && ps.cards.length === 2,
          },
        });
      } catch {
        // ignore
      }

      ps.status = "done";
    }

    const uniqueWinners: string[] = Array.from(new Set(winners));

    let message = "Aucun gagnant";
    if (uniqueWinners.length > 0) {
      message = "Gagnant(s): " + uniqueWinners.map((u) => `${u} (+${netWins[u]})`).join(", ");
    }

    state.roundResult = {
      winners: uniqueWinners,
      netWins,
      message,
    };
  }

  private emitRoundResultMessage(tableCode: string, state: GameState) {
    // ✅ évite les soucis TS 'never' en forçant le type
    const rr = state.roundResult as RoundResult | null;
    if (!rr) return;
    this.blackjackChatGateway.emitSystemToTable(tableCode, rr.message);
  }

  // ============================================================
  // Next round timer
  // ============================================================
  private scheduleNextRound(tableCode: string, gameId: string) {
    setTimeout(async () => {
      try {
        const game = await this.gamesRepo.findOne({ where: { id: gameId } as any });
        if (!game) return;

        const state = this.parseState(game);
        if (state.phase !== "finished") return;

        await this.autoNextRound(game, state);

        this.blackjackChatGateway.emitSystemToTable(
          tableCode,
          `Nouveau round #${state.round}. Placez vos mises.`
        );
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("AUTO NEXT ROUND ERROR", err);
      }
    }, NEXT_ROUND_DELAY_MS);
  }

  private async autoNextRound(game: BlackjackGame, state: GameState) {
    state.round += 1;
    state.phase = "betting";
    state.dealer = { cards: [], value: 0 };
    state.turnOrder = [];
    state.currentTurnIndex = 0;

    state.waitingPlayers = [];
    state.roundResult = null;

    for (const k of Object.keys(state.players)) {
      state.players[k].bet = 0;
      state.players[k].cards = [];
      state.players[k].status = "waiting";
    }

    await this.saveState(game, state);
  }
}
