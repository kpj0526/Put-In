import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendVerificationEmail(params: {
    to: string;
    nickname: string;
    token: string;
  }): Promise<void> {
    const appUrl = this.configService.get<string>(
      'CLIENT_ORIGIN',
      'http://localhost:5173',
    );
    const verifyUrl = `${appUrl}/?verifyToken=${encodeURIComponent(params.token)}`;
    const host = this.configService.get<string>('SMTP_HOST');

    if (!host) {
      this.logger.warn(`SMTP is not configured. Verification URL: ${verifyUrl}`);
      return;
    }

    const transporter = nodemailer.createTransport({
      host,
      port: Number(this.configService.get<string>('SMTP_PORT', '587')),
      secure: this.configService.get<string>('SMTP_SECURE', 'false') === 'true',
      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASS'),
      },
    });

    await transporter.sendMail({
      from: this.configService.get<string>(
        'MAIL_FROM',
        'Plug Rush <no-reply@plugrush.local>',
      ),
      to: params.to,
      subject: 'Verify your Plug Rush email',
      text: `Hi ${params.nickname}, verify your email: ${verifyUrl}`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5">
          <h2>Verify your Plug Rush email</h2>
          <p>Hi ${params.nickname}, click the button below to verify your email.</p>
          <p><a href="${verifyUrl}" style="display:inline-block;padding:12px 18px;background:#31f5a6;color:#101510;text-decoration:none;font-weight:700">Verify email</a></p>
          <p>If the button does not work, open this link:</p>
          <p>${verifyUrl}</p>
        </div>
      `,
    });
  }
}
