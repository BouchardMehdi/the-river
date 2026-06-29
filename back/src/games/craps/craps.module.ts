import { Module } from '@nestjs/common';
import { UsersModule } from '../../users/users.module';
import { CrapsController } from './craps.controller';
import { CrapsService } from './craps.service';

@Module({
  imports: [UsersModule],
  controllers: [CrapsController],
  providers: [CrapsService],
})
export class CrapsModule {}
