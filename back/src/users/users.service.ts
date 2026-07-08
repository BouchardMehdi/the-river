import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  OnModuleInit,
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

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
  ) {}

  async onModuleInit() {
    await this.ensureAvatarColumn();
  }

  private async ensureAvatarColumn() {
    try {
      const rows = await this.usersRepo.query("SHOW COLUMNS FROM `users` LIKE 'avatarUrl'");
      if (!Array.isArray(rows) || rows.length === 0) {
        await this.usersRepo.query("ALTER TABLE `users` ADD COLUMN `avatarUrl` varchar(500) NULL");
      }
    } catch {
      // The app can still run if the database user cannot alter schema.
    }
  }

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

    if (!looksLikeBcryptHash(password)) {
      if (!bcrypt?.hash) {
        throw new InternalServerErrorException('bcrypt indisponible');
      }
      try {
        storedPassword = await bcrypt.hash(password, 10);
      } catch {
        throw new InternalServerErrorException('Impossible de securiser le mot de passe');
      }
    }

    const u = this.usersRepo.create({
      username,
      email,
      password: storedPassword,
      credits: 1000,
      points: 0,
      emailVerified: false,
      avatarUrl: null,

      // 🥚 defaults (robuste même si DB ancienne)
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

  async updateAccount(
    userId: number,
    patch: { username?: string; email?: string; emailVerified?: boolean },
  ): Promise<UserEntity> {
    const id = Number(userId);
    if (!Number.isFinite(id) || id <= 0) throw new BadRequestException('userId invalide');

    const current = await this.findById(id);
    if (!current) throw new NotFoundException('User not found');

    const nextUsername = patch.username?.trim();
    if (nextUsername && nextUsername !== current.username) {
      if (nextUsername.length < 3) throw new BadRequestException('Pseudo trop court (min 3)');
      if (nextUsername.length > 30) throw new BadRequestException('Pseudo trop long (max 30)');

      const existsU = await this.usersRepo.findOne({ where: { username: nextUsername } });
      if (existsU && existsU.userId !== id) throw new BadRequestException('Pseudo deja utilise');
      current.username = nextUsername;
    }

    const nextEmail = patch.email?.trim().toLowerCase();
    if (nextEmail && nextEmail !== current.email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) throw new BadRequestException('Email invalide');

      const existsE = await this.usersRepo.findOne({ where: { email: nextEmail } });
      if (existsE && existsE.userId !== id) throw new BadRequestException('Email deja utilise');
      current.email = nextEmail;
      current.emailVerified = patch.emailVerified ?? false;
    } else if (typeof patch.emailVerified === 'boolean') {
      current.emailVerified = patch.emailVerified;
    }

    return this.usersRepo.save(current);
  }

  // ---------------- EMAIL VERIFIED ----------------
  async setEmailVerified(userId: number, verified: boolean): Promise<void> {
    await this.usersRepo.update({ userId }, { emailVerified: verified });
  }

  // ---------------- PASSWORD ----------------
  async setPassword(userId: number, newPassword: string): Promise<void> {
    let storedPassword = newPassword;

    if (!bcrypt?.hash) {
      throw new InternalServerErrorException('bcrypt indisponible');
    }

    if (bcrypt?.hash) {
      try {
        storedPassword = await bcrypt.hash(newPassword, 10);
      } catch {
        throw new InternalServerErrorException('Impossible de securiser le mot de passe');
      }
    }

    await this.usersRepo.update({ userId }, { password: storedPassword });
  }

  // ---------------- CREDITS ----------------
  async debitCreditsByUsername(username: string, amount: number): Promise<UserEntity> {
    const a = Number(amount || 0);
    const normalized = String(username ?? '').trim();
    if (!normalized) throw new BadRequestException('username requis');
    if (a <= 0) {
      const u = await this.findByUsername(normalized);
      if (!u) throw new NotFoundException('User not found');
      return u;
    }

    const result = await this.usersRepo
      .createQueryBuilder()
      .update(UserEntity)
      .set({ credits: () => 'credits - :amount' })
      .where('username = :username', { username: normalized })
      .andWhere('credits >= :amount', { amount: a })
      .execute();

    if (!result.affected) {
      const exists = await this.findByUsername(normalized);
      if (!exists) throw new NotFoundException('User not found');
      throw new BadRequestException('Credits insuffisants');
    }

    const updated = await this.findByUsername(normalized);
    if (!updated) throw new NotFoundException('User not found');
    return updated;
  }

  async creditCreditsByUsername(username: string, amount: number): Promise<UserEntity> {
    const a = Number(amount || 0);
    const normalized = String(username ?? '').trim();
    if (!normalized) throw new BadRequestException('username requis');
    if (a <= 0) {
      const u = await this.findByUsername(normalized);
      if (!u) throw new NotFoundException('User not found');
      return u;
    }

    const result = await this.usersRepo
      .createQueryBuilder()
      .update(UserEntity)
      .set({ credits: () => 'credits + :amount' })
      .where('username = :username', { username: normalized })
      .setParameters({ amount: a })
      .execute();

    if (!result.affected) throw new NotFoundException('User not found');

    const updated = await this.findByUsername(normalized);
    if (!updated) throw new NotFoundException('User not found');
    return updated;
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
    { userId: number; username: string; points: number; avatarUrl: string | null }[]
  > {
    const take = Math.max(1, Math.min(200, Number(limit) || 50));

    const users = await this.usersRepo.find({
      select: ['userId', 'username', 'points', 'avatarUrl'],
      order: { points: 'DESC' },
      take,
    });

    return users.map((u) => ({
      userId: u.userId,
      username: u.username,
      points: u.points ?? 0,
      avatarUrl: u.avatarUrl ?? null,
    }));
  }

  async setAvatarUrl(userId: number, avatarUrl: string | null): Promise<UserEntity> {
    await this.usersRepo.update({ userId }, { avatarUrl });
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async getAvatarsByUsernames(usernames: string[]) {
    const clean = Array.from(new Set(usernames.map((name) => String(name ?? '').trim()).filter(Boolean))).slice(0, 80);
    if (clean.length <= 0) return {};

    const users = await this.usersRepo
      .createQueryBuilder('u')
      .select(['u.username', 'u.avatarUrl'])
      .where('u.username IN (:...usernames)', { usernames: clean })
      .getMany();

    return Object.fromEntries(users.map((user) => [user.username, user.avatarUrl ?? null]));
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

  /**
   * Débloque une clé si pas déjà débloquée.
   * Retourne true si la DB a réellement changé (donc popup côté front).
   */
  private async legacyEasterEggKeyDisabled(userId: number, key: 'slots' | 'blackjack' | 'roulette' | 'poker'): Promise<boolean> {
    const id = Number(userId);
    if (!Number.isFinite(id) || id <= 0) return false;

    const map: Record<'slots' | 'blackjack' | 'roulette' | 'poker', keyof UserEntity> = {
      slots: 'userId',
      blackjack: 'userId',
      roulette: 'userId',
      poker: 'userId',
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

  private async legacyEasterEggVisitDisabled(userId: number): Promise<boolean> {
    const id = Number(userId);
    if (!Number.isFinite(id) || id <= 0) return false;

    const res = await this.usersRepo
      .createQueryBuilder()
      .update(UserEntity)
      .set({ userId: () => 'userId' } as any)
      .where('userId = :id', { id })
      .andWhere('1 = 0')
      .execute();

    return !!res.affected && res.affected > 0;
  }
}
