import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly repo: Repository<UserEntity>,
  ) {}

  // utilisé par AuthService (login)
  async findOne(username: string): Promise<UserEntity | null> {
    return this.repo.findOne({ where: { username } });
  }

  async findByUsername(username: string): Promise<UserEntity | null> {
    return this.findOne(username);
  }

  // utilisé par AuthService (register)
  async create(user: { username: string; password: string; credits?: number }): Promise<UserEntity> {
    const entity = this.repo.create({
      username: user.username,
      password: user.password,
      credits: user.credits ?? 1000,
    });

    return this.repo.save(entity);
  }
}
