import { Test, TestingModule } from '@nestjs/testing';
import { TableSeedService } from './table-seed.service';

describe('TableSeedService', () => {
  let service: TableSeedService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TableSeedService],
    }).compile();

    service = module.get<TableSeedService>(TableSeedService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
