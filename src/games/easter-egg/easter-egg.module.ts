import { Module } from '@nestjs/common';

import { UsersModule } from '../../users/users.module';
import { EasterEggController } from './easter-egg.controller';
import { EasterEggService } from './easter-egg.service';

@Module({
  imports: [UsersModule],
  controllers: [EasterEggController],
  providers: [EasterEggService],
  exports: [EasterEggService],
})
export class EasterEggModule {}
