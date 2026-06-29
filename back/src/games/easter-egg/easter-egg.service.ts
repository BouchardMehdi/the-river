import { Injectable } from '@nestjs/common';
import { UsersService } from '../../users/users.service';

@Injectable()
export class EasterEggService {
  constructor(private readonly usersService: UsersService) {}

  async getStatus(userId: number) {
    return this.usersService.getEasterEggStatusByUserId(userId);
  }

  async markVisited(userId: number) {
    const changed = await this.usersService.markEasterEggVisitedByUserId(userId);
    const status = await this.usersService.getEasterEggStatusByUserId(userId);
    return { ok: true, changed, status };
  }
}
