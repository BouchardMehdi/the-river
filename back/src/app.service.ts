import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      status: 'ok',
      service: 'the-river-back',
      timestamp: new Date().toISOString(),
    };
  }
}
