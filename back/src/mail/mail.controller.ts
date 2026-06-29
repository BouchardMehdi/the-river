import { Controller, Get, Query } from '@nestjs/common';
import { MailService } from './mail.service';

@Controller('mail')
export class MailController {
  constructor(private readonly mail: MailService) {}

  @Get('test')
  async test(@Query('to') to = 'test@local.dev') {
    await this.mail.sendMail({
      to,
      subject: 'THE RIVER — Test MailHog',
      text: 'Si tu vois ce mail dans MailHog, c’est OK ✅',
      html: '<b>Si tu vois ce mail dans MailHog, c’est OK ✅</b>',
    });
    return { ok: true };
  }
}
