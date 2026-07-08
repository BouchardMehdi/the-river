import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UserEntity } from './entities/user.entity';
import { ProfileController } from './profile.controller';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity])],
  controllers: [ProfileController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
