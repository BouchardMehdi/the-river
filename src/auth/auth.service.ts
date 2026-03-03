import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import crypto from 'crypto';

import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { MailService } from '../mail/mail.service';
import { EmailVerificationEntity } from './entities/email-verification.entity';
import { PasswordResetEntity } from './entities/password-reset.entity';

// ✅ bcrypt optionnel
let bcrypt: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  bcrypt = require('bcrypt');
} catch {
  bcrypt = null;
}

function looksLikeBcryptHash(s: string): boolean {
  return typeof s === 'string' && (s.startsWith('$2a$') || s.startsWith('$2b$') || s.startsWith('$2y$'));
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    @InjectRepository(EmailVerificationEntity)
    private readonly emailVerifRepo: Repository<EmailVerificationEntity>,
    @InjectRepository(PasswordResetEntity)
    private readonly resetRepo: Repository<PasswordResetEntity>,
  ) {}

  private tokenSalt(): string {
    return this.config.get<string>('AUTH_TOKEN_SALT') || this.config.get<string>('JWT_SECRET') || 'theriver';
  }

  private hashCode(code: string): string {
    return crypto.createHash('sha256').update(`${code}:${this.tokenSalt()}`).digest('hex');
  }

  private gen6(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  private async passwordMatches(stored: string, provided: string): Promise<boolean> {
    if (!stored || !provided) return false;

    if (looksLikeBcryptHash(stored) && bcrypt?.compare) {
      try {
        return await bcrypt.compare(provided, stored);
      } catch {
        return false;
      }
    }

    return stored === provided;
  }

  async signIn(username: string, password: string) {
    const u = (username ?? '').trim();
    const p = password ?? '';
    if (!u || !p) throw new UnauthorizedException('Identifiants invalides');

    const user = await this.usersService.findByUsername(u);
    if (!user) throw new UnauthorizedException('Identifiants invalides');

    // ✅ Bloque login tant que email non vérifié
    if (!user.emailVerified) {
      throw new UnauthorizedException("Email non vérifié. Vérifie ta boîte mail.");
    }

    const ok = await this.passwordMatches(user.password, p);
    if (!ok) throw new UnauthorizedException('Identifiants invalides');

    const payload = { sub: user.userId, username: user.username };

    return {
      access_token: await this.jwtService.signAsync(payload),
      user: {
        userId: user.userId,
        username: user.username,
        credits: user.credits ?? 0,
        points: user.points ?? 0,
        email: user.email,
        emailVerified: user.emailVerified,
      },
    };
  }

  async register(dto: RegisterDto) {
    const username = (dto.username ?? '').trim();
    const email = (dto.email ?? '').trim().toLowerCase();
    const password = dto.password ?? '';

    if (!username) throw new BadRequestException("Nom d'utilisateur requis");
    if (!email) throw new BadRequestException('Email requis');
    if (!password) throw new BadRequestException('Mot de passe requis');

    const user = await this.usersService.create({ username, email, password });

    // ✅ Envoi code de vérification + mail bienvenue
    await this.sendEmailVerification(user.userId, user.email, user.username);

    // ✅ On peut retourner token, mais l’utilisateur ne pourra pas jouer tant que non vérifié
    const payload = { sub: user.userId, username: user.username };
    return {
      access_token: await this.jwtService.signAsync(payload),
      user: {
        userId: user.userId,
        username: user.username,
        credits: user.credits ?? 0,
        points: user.points ?? 0,
        email: user.email,
        emailVerified: user.emailVerified,
      },
      needsEmailVerification: true,
    };
  }

  private async sendEmailVerification(userId: number, email: string, username: string) {
    // Invalide anciens codes non utilisés (optionnel)
    await this.emailVerifRepo.update({ userId, usedAt: IsNull() }, { usedAt: new Date() });

    const code = this.gen6();
    const codeHash = this.hashCode(code);

    const ttlMin = Number(this.config.get<string>('VERIFY_EMAIL_TTL_MIN') ?? 30);
    const expiresAt = new Date(Date.now() + ttlMin * 60_000);

    await this.emailVerifRepo.save(
      this.emailVerifRepo.create({ userId, email, codeHash, expiresAt, usedAt: null }),
    );

    await this.mail.sendMail({
      to: email,
      subject: 'THE RIVER — Vérification de votre email',
      text:
        `Bienvenue sur THE RIVER, ${username} !\n\n` +
        `Votre code de vérification est : ${code}\n` +
        `Il expire dans ${ttlMin} minutes.\n\n` +
        `Si vous n'êtes pas à l'origine de cette inscription, ignorez ce message.`,
      html:
        `<p>Bienvenue sur <b>THE RIVER</b>, ${username} !</p>` +
        `<p>Votre code de vérification est :</p>` +
        `<h2 style="letter-spacing:2px">${code}</h2>` +
        `<p>Il expire dans <b>${ttlMin} minutes</b>.</p>` +
        `<p>Si vous n'êtes pas à l'origine de cette inscription, ignorez ce message.</p>`,
    });
  }

  async resendVerification(email: string) {
    const e = (email ?? '').trim().toLowerCase();
    if (!e) throw new BadRequestException('Email requis');

    const user = await this.usersService.findByEmail(e);
    // ✅ anti-enumération : réponse OK même si email inconnu
    if (!user) return { ok: true };

    if (user.emailVerified) return { ok: true };

    await this.sendEmailVerification(user.userId, user.email, user.username);
    return { ok: true };
  }

  async verifyEmail(email: string, code: string) {
    const e = (email ?? '').trim().toLowerCase();
    const c = (code ?? '').trim();

    if (!e || !c) throw new BadRequestException('Email + code requis');

    const user = await this.usersService.findByEmail(e);
    if (!user) throw new BadRequestException('Code invalide');

    const codeHash = this.hashCode(c);

    const token = await this.emailVerifRepo.findOne({
      where: { userId: user.userId, usedAt: IsNull(), codeHash },
      order: { createdAt: 'DESC' },
    });

    if (!token) throw new BadRequestException('Code invalide');
    if (token.expiresAt.getTime() < Date.now()) throw new BadRequestException('Code expiré');

    token.usedAt = new Date();
    await this.emailVerifRepo.save(token);

    await this.usersService.setEmailVerified(user.userId, true);

    return { ok: true };
  }

  async forgotPassword(email: string) {
    const e = (email ?? '').trim().toLowerCase();
    if (!e) throw new BadRequestException('Email requis');

    const user = await this.usersService.findByEmail(e);

    // ✅ anti-enumération : toujours OK
    if (!user) return { ok: true };

    // Invalide anciens tokens non utilisés
    await this.resetRepo.update({ userId: user.userId, usedAt: IsNull() }, { usedAt: new Date() });

    const code = this.gen6();
    const codeHash = this.hashCode(code);

    const ttlMin = Number(this.config.get<string>('RESET_PASSWORD_TTL_MIN') ?? 15);
    const expiresAt = new Date(Date.now() + ttlMin * 60_000);

    await this.resetRepo.save(
      this.resetRepo.create({ userId: user.userId, email: user.email, codeHash, expiresAt, usedAt: null }),
    );

    await this.mail.sendMail({
      to: user.email,
      subject: 'THE RIVER — Réinitialisation du mot de passe',
      text:
        `Voici votre code de réinitialisation : ${code}\n` +
        `Il expire dans ${ttlMin} minutes.\n\n` +
        `Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
      html:
        `<p>Voici votre code de réinitialisation :</p>` +
        `<h2 style="letter-spacing:2px">${code}</h2>` +
        `<p>Il expire dans <b>${ttlMin} minutes</b>.</p>` +
        `<p>Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p>`,
    });

    return { ok: true };
  }

  async resetPassword(email: string, code: string, newPassword: string) {
    const e = (email ?? '').trim().toLowerCase();
    const c = (code ?? '').trim();
    const np = newPassword ?? '';

    if (!e || !c || !np) throw new BadRequestException('Email + code + nouveau mot de passe requis');
    if (np.length < 6) throw new BadRequestException('Mot de passe trop court (min 6)');

    const user = await this.usersService.findByEmail(e);
    if (!user) throw new BadRequestException('Code invalide');

    const codeHash = this.hashCode(c);

    const token = await this.resetRepo.findOne({
      where: { userId: user.userId, usedAt: IsNull(), codeHash },
      order: { createdAt: 'DESC' },
    });

    if (!token) throw new BadRequestException('Code invalide');
    if (token.expiresAt.getTime() < Date.now()) throw new BadRequestException('Code expiré');

    token.usedAt = new Date();
    await this.resetRepo.save(token);

    await this.usersService.setPassword(user.userId, np);

    return { ok: true };
  }
}
