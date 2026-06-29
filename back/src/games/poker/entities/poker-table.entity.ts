import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

export type TableVisibility = 'PUBLIC' | 'PRIVATE';
export type TableMode = 'CASUAL' | 'COMPETITION';

@Entity('poker_tables')
@Index('UQ_poker_tables_id', ['id'], { unique: true })
export class PokerTableEntity {
  @PrimaryColumn({ type: 'varchar', length: 6 })
  id: string;

  @Column({ type: 'varchar', length: 64 })
  name: string;

  @Column({ type: 'int', default: 6 })
  maxPlayers: number;

  @Column({ type: 'int' })
  buyInAmount: number;

  @Column({ type: 'int' })
  smallBlindAmount: number;

  @Column({ type: 'int' })
  bigBlindAmount: number;

  @Column({ type: 'varchar', length: 8, default: 'PRIVATE' })
  visibility: TableVisibility;

  @Column({ type: 'varchar', length: 16, default: 'CASUAL' })
  mode: TableMode;

  @Column({ type: 'boolean', default: false })
  fillWithBots: boolean;

  @Column({ type: 'varchar', length: 16, default: 'OPEN' })
  status: string;

  @Column({ type: 'varchar', length: 16, default: 'WAITING' })
  phase: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  createdAt?: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  startedAt?: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ownerPlayerId?: string;

  // ✅ JSON sans default
  @Column({ type: 'simple-json' })
  players: string[];

  @Column({ type: 'simple-json' })
  hands: Record<string, any>;

  @Column({ type: 'simple-json' })
  communityCards: any[];

  @Column({ type: 'simple-json' })
  deck: any[];

  @Column({ type: 'simple-json' })
  burnedCards: any[];

  @Column({ type: 'simple-json' })
  stacks: Record<string, number>;

  @Column({ type: 'int', default: 0 })
  pot: number;

  @Column({ type: 'int', default: 0 })
  currentBet: number;

  @Column({ type: 'simple-json' })
  bets: Record<string, number>;

  @Column({ type: 'simple-json' })
  foldedPlayers: Record<string, boolean>;

  @Column({ type: 'simple-json' })
  hasActed: Record<string, boolean>;

  @Column({ type: 'simple-json' })
  contributions: Record<string, number>;

  @Column({ type: 'int', default: 0 })
  dealerIndex: number;

  @Column({ type: 'simple-json' })
  bustedPlayers: Record<string, boolean>;

  @Column({ type: 'simple-json', nullable: true })
  lastWinners?: any[];

  @Column({ type: 'text', nullable: true })
  lastWinnerHandDescription?: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  dealerPlayerId?: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  smallBlindPlayerId?: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  bigBlindPlayerId?: string;

  @Column({ type: 'simple-json', nullable: true })
  showdownHands?: Record<string, any[]>;

  @Column({ type: 'int', nullable: true })
  showdownEndsAt?: number;
}
