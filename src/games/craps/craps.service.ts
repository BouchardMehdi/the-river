import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { UsersService } from '../../users/users.service';
import type { JwtUser } from '../../auth/jwt.strategy';

@Injectable()
export class CrapsService {
  constructor(private readonly usersService: UsersService) {}

  private hasAllKeys(u: any): boolean {
    return Boolean(u?.eggKeySlots && u?.eggKeyBlackjack && u?.eggKeyRoulette && u?.eggKeyPoker);
  }

  private rollDie(): number {
    return Math.floor(Math.random() * 6) + 1; // 1..6
  }

  async play(user: JwtUser, dto: { guessTotal: number; bet: number }) {
    const guessTotal = Number(dto?.guessTotal);
    const bet = Number(dto?.bet);

    if (!Number.isFinite(guessTotal) || guessTotal < 2 || guessTotal > 12) {
      throw new BadRequestException('INVALID_GUESS_TOTAL'); // 2..12
    }
    if (!Number.isFinite(bet) || bet <= 0) {
      throw new BadRequestException('INVALID_BET');
    }

    // ✅ Vérif clés (jeu caché tant que pas 4/4)
    const dbUser = await this.usersService.findByUsername(user.username);
    if (!dbUser) throw new BadRequestException('USER_NOT_FOUND');
    if (!this.hasAllKeys(dbUser)) throw new ForbiddenException('EASTER_EGG_LOCKED');

    // ✅ Mise
    await this.usersService.debitCreditsByUsername(user.username, bet);

    // 🎲 Roll
    const d1 = this.rollDie();
    const d2 = this.rollDie();
    const total = d1 + d2;

    const win = total === guessTotal;

    // “gagne 1.5 fois la mise” => on crédite 1.5× après avoir débité la mise (net = +0.5×)
    const payout = win ? Math.floor(bet * 1.5) : 0;
    if (payout > 0) {
      await this.usersService.creditCreditsByUsername(user.username, payout);
    }

    const refreshed = await this.usersService.findByUsername(user.username);

    return {
      ok: true,
      dice: [d1, d2],
      total,
      guessTotal,
      bet,
      win,
      payout,
      net: payout - bet,
      credits: refreshed?.credits ?? null,
    };
  }
}
