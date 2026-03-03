import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { join } from 'path';

@Controller()
export class FrontPagesController {
  @Get('easter-egg')
  easterEgg(@Res() res: Response) {
    // public/html/easter-egg.html
    return res.sendFile(join(process.cwd(), 'public', 'html', 'easter-egg.html'));
  }
}
