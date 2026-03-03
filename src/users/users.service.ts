import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from './entities/user.entity';

// ✅ bcrypt optionnel
let bcrypt: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  bcrypt = require('bcrypt');
} catch {
  bcrypt = null;
}

function looksLikeBcryptHash(s: string): boolean {
  return (
    typeof s === 'string' &&
    (s.startsWith('$2a$') || s.startsWith('$2b$') || s.startsWith('$2y$'))
  );
}

export type EasterEggKey = 'slots' | 'blackjack' | 'roulette' | 'poker';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
  ) {}

  // ---------------- CREATE ----------------
  async create(body: {
    username: string;
    email: string;
    password: string;
  }): Promise<UserEntity> {
    const username = (body.username ?? '').trim();
    const email = (body.email ?? '').trim().toLowerCase();
    const password = body.password ?? '';

    if (!username) throw new BadRequestException('username requis');
    if (!email) throw new BadRequestException('email requis');
    if (!password) throw new BadRequestException('password requis');

    const existsU = await this.usersRepo.findOne({ where: { username } });
    if (existsU) throw new BadRequestException('username déjà utilisé');

    const existsE = await this.usersRepo.findOne({ where: { email } });
    if (existsE) throw new BadRequestException('email déjà utilisé');

    let storedPassword = password;

    // ✅ si bcrypt est installé, on hash à l’inscription
    if (!looksLikeBcryptHash(password) && bcrypt?.hash) {
      try {
        storedPassword = await bcrypt.hash(password, 10);
      } catch {
        storedPassword = password;
      }
    }

    const u = this.usersRepo.create({
      username,
      email,
      password: storedPassword,
      credits: 1000,
      points: 0,
      emailVerified: false,

      // 🥚 defaults (robuste même si DB ancienne)
      eggKeySlots: false as any,
      eggKeyBlackjack: false as any,
      eggKeyRoulette: false as any,
      eggKeyPoker: false as any,
      eggEasterEggVisited: false as any,
    });

    return this.usersRepo.save(u);
  }

  // ---------------- FINDERS ----------------
  async findByUsername(username: string): Promise<UserEntity | null> {
    return this.usersRepo.findOne({ where: { username } });
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    return this.usersRepo.findOne({
      where: { email: (email ?? '').trim().toLowerCase() },
    });
  }

  async findById(userId: number): Promise<UserEntity | null> {
    return this.usersRepo.findOne({ where: { userId } });
  }

  // ---------------- EMAIL VERIFIED ----------------
  async setEmailVerified(userId: number, verified: boolean): Promise<void> {
    await this.usersRepo.update({ userId }, { emailVerified: verified });
  }

  // ---------------- PASSWORD ----------------
  async setPassword(userId: number, newPassword: string): Promise<void> {
    let storedPassword = newPassword;

    if (bcrypt?.hash) {
      try {
        storedPassword = await bcrypt.hash(newPassword, 10);
      } catch {
        storedPassword = newPassword;
      }
    }

    await this.usersRepo.update({ userId }, { password: storedPassword });
  }

  // ---------------- CREDITS ----------------
  async debitCreditsByUsername(username: string, amount: number): Promise<UserEntity> {
    const u = await this.findByUsername(username);
    if (!u) throw new NotFoundException('User not found');

    const a = Number(amount || 0);
    if (a <= 0) return u;

    if ((u.credits ?? 0) < a) throw new BadRequestException('Crédits insuffisants');

    u.credits = (u.credits ?? 0) - a;
    return this.usersRepo.save(u);
  }

  async creditCreditsByUsername(username: string, amount: number): Promise<UserEntity> {
    const u = await this.findByUsername(username);
    if (!u) throw new NotFoundException('User not found');

    const a = Number(amount || 0);
    if (a <= 0) return u;

    u.credits = (u.credits ?? 0) + a;
    return this.usersRepo.save(u);
  }

  // =========================================================
  // ✅ AJOUTS POUR LE POKER (corrige tes erreurs)
  // =========================================================

  /**
   * Ajoute des points (poker compétition).
   * wid dans ton tables.service est très probablement un userId (number).
   */
  async addPoints(userId: number, deltaPoints: number): Promise<UserEntity> {
    const id = Number(userId);
    const d = Number(deltaPoints || 0);

    if (!Number.isFinite(id) || id <= 0) {
      throw new BadRequestException('userId invalide');
    }
    if (!Number.isFinite(d) || d === 0) {
      // pas d’erreur, juste no-op
      const u0 = await this.findById(id);
      if (!u0) throw new NotFoundException('User not found');
      return u0;
    }

    const u = await this.findById(id);
    if (!u) throw new NotFoundException('User not found');

    u.points = (u.points ?? 0) + d;
    return this.usersRepo.save(u);
  }

  /**
   * Leaderboard poker (classement par points).
   * Utilisé par src/games/poker/leaderboard/leaderboard.controller.ts
   */
  async getLeaderboard(limit = 50): Promise<
    { userId: number; username: string; points: number }[]
  > {
    const take = Math.max(1, Math.min(200, Number(limit) || 50));

    const users = await this.usersRepo.find({
      select: ['userId', 'username', 'points'],
      order: { points: 'DESC' },
      take,
    });

    return users.map((u) => ({
      userId: u.userId,
      username: u.username,
      points: u.points ?? 0,
    }));
  }

  async addPointsByUsername(username: string, deltaPoints: number) {
    const u = await this.findByUsername(String(username || '').trim());
    if (!u) throw new NotFoundException('User not found');

    const d = Number(deltaPoints || 0);
    if (!Number.isFinite(d) || d === 0) return u;

    u.points = (u.points ?? 0) + d;
    return this.usersRepo.save(u);
  }

  // =========================================================
  // 🥚 EASTER EGG HELPERS
  // =========================================================

  async getEasterEggStatusByUserId(userId: number) {
    const u = await this.findById(Number(userId));
    if (!u) throw new NotFoundException('User not found');

    const keys = {
      slots: Boolean((u as any).eggKeySlots),
      blackjack: Boolean((u as any).eggKeyBlackjack),
      roulette: Boolean((u as any).eggKeyRoulette),
      poker: Boolean((u as any).eggKeyPoker),
    };

    const unlockedCount = Object.values(keys).filter(Boolean).length;

    return {
      keys,
      unlockedCount,
      total: 4,
      allKeys: unlockedCount >= 4,
      visited: Boolean((u as any).eggEasterEggVisited),
    };
  }

  /**
   * Débloque une clé si pas déjà débloquée.
   * Retourne true si la DB a réellement changé (donc popup côté front).
   */
  async unlockEasterEggKeyByUserId(userId: number, key: EasterEggKey): Promise<boolean> {
    const id = Number(userId);
    if (!Number.isFinite(id) || id <= 0) return false;

    const map: Record<EasterEggKey, keyof UserEntity> = {
      slots: 'eggKeySlots',
      blackjack: 'eggKeyBlackjack',
      roulette: 'eggKeyRoulette',
      poker: 'eggKeyPoker',
    };

    const col = map[key];

    // update atomique : uniquement si encore à 0
    const res = await this.usersRepo
      .createQueryBuilder()
      .update(UserEntity)
      .set({ [col]: () => '1' } as any)
      .where('userId = :id', { id })
      .andWhere(`${String(col)} = 0`)
      .execute();

    return !!res.affected && res.affected > 0;
  }

  /**
   * Appelé quand le joueur clique "Retour dashboard" sur /easter-egg.
   * Marque visited=true (une seule fois).
   */
  async markEasterEggVisitedByUserId(userId: number): Promise<boolean> {
    const id = Number(userId);
    if (!Number.isFinite(id) || id <= 0) return false;

    const res = await this.usersRepo
      .createQueryBuilder()
      .update(UserEntity)
      .set({ eggEasterEggVisited: () => '1' } as any)
      .where('userId = :id', { id })
      .andWhere('eggEasterEggVisited = 0')
      .execute();

    return !!res.affected && res.affected > 0;
  }
}
