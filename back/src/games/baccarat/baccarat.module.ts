import { Module } from '@nestjs/common';

import { UsersModule } from '../../users/users.module';
import { StatsModule } from '../stats/stats.module';
import { BaccaratController } from './baccarat.controller';
import { BaccaratService } from './baccarat.service';

@Module({
  imports: [UsersModule, StatsModule],
  controllers: [BaccaratController],
  providers: [BaccaratService],
})
export class BaccaratModule {}
