import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SlotsController } from './slots.controller';
import { SlotsService } from './slots.service';
import { UserEntity } from '../../users/entities/user.entity';
import { UsersModule } from 'src/users/users.module';
import { StatsModule } from '../stats/stats.module';

@Module({
  // ✅ On retire SlotSpinEntity pour ne plus créer/écrire la table slot_spins
  // ✅ On importe StatsModule pour enregistrer un event dans game_events
  imports: [TypeOrmModule.forFeature([UserEntity]), StatsModule, UsersModule],
  controllers: [SlotsController],
  providers: [SlotsService],
})
export class SlotsModule {}
