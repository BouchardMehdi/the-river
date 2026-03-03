import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('MAIL_HOST');
    const port = Number(this.config.get<string>('MAIL_PORT') ?? 0);

    const secureEnv = this.config.get<string>('MAIL_SECURE');
    const secure =
      secureEnv !== undefined
        ? secureEnv === 'true' || secureEnv === '1'
        : port === 465;

    const user = (this.config.get<string>('MAIL_USER') || '').trim();
    const pass = (this.config.get<string>('MAIL_PASS') || '').trim();

    if (!host || !port) {
      this.logger.warn('MailService: MAIL_HOST/MAIL_PORT manquants. Emails désactivés.');
      return;
    }

    const base: SMTPTransport.Options = {
      host,
      port,
      secure,
    };

    const auth: Partial<SMTPTransport.Options> =
      user && pass ? { auth: { user, pass } } : {};

    this.transporter = nodemailer.createTransport({
      ...base,
      ...auth,
    });

    this.logger.log(
      `MailService: SMTP ready ${host}:${port} secure=${secure} auth=${user ? 'yes' : 'no'}`,
    );
  }

  async sendMail(payload: { to: string; subject: string; text: string; html?: string }) {
    if (!this.transporter) return;

    const from = this.config.get<string>('MAIL_FROM') || 'THE RIVER <noreply@theriver.local>';

    try {
      await this.transporter.sendMail({
        from,
        to: payload.to,
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
      });
    } catch (e: any) {
      this.logger.error(`sendMail failed: ${e?.message || e}`);
    }
  }
}
