import { Test, TestingModule } from '@nestjs/testing';
import { TableResetService } from './table-reset.service';

describe('TableResetService', () => {
  let service: TableResetService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TableResetService],
    }).compile();

    service = module.get<TableResetService>(TableResetService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
