import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PokerTableEntity } from '../entities/poker-table.entity';

@Injectable()
export class TableSeedService implements OnModuleInit {
  constructor(
    @InjectRepository(PokerTableEntity)
    private readonly repo: Repository<PokerTableEntity>,
  ) {}

  async onModuleInit() {
    return;
  }
}
