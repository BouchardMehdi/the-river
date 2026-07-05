import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UserQuestStateEntity } from '../quests/entities/user-quest-state.entity';

@Injectable()
export class EasterEggService {
  private readonly invitationQuestKey = 'secret_dragon_invitation';

  constructor(
    @InjectRepository(UserQuestStateEntity)
    private readonly questRepo: Repository<UserQuestStateEntity>,
  ) {}

  async getStatus(userId: number) {
    const state = await this.questRepo.findOne({
      where: { userId: Number(userId), questKey: this.invitationQuestKey } as any,
    });
    const unlocked = Boolean(state?.lastClaimedAt);

    return {
      key: this.invitationQuestKey,
      unlocked,
      title: unlocked ? 'Salon du Dragon' : '???',
      game: unlocked ? 'Dragon Tiger' : null,
      href: unlocked ? '/easter-egg' : null,
      claimedAt: state?.lastClaimedAt ? state.lastClaimedAt.toISOString() : null,
    };
  }
}
