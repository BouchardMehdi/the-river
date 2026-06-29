import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ChatGateway } from './chat.gateway';
import { PokerTableEntity } from '../entities/poker-table.entity';

@Module({
  imports: [
    ConfigModule,
    JwtModule.register({}),
    TypeOrmModule.forFeature([PokerTableEntity]),
  ],
  providers: [ChatGateway],
  exports: [ChatGateway],
})
export class ChatModule {}
