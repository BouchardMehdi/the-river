import { Module } from '@nestjs/common';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UsersModule } from '../users/users.module';
import { MailModule } from '../mail/mail.module';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { EmailVerificationEntity } from './entities/email-verification.entity';
import { PasswordResetEntity } from './entities/password-reset.entity';

@Module({
  imports: [
    UsersModule,
    MailModule,
    PassportModule,
    ConfigModule,
    TypeOrmModule.forFeature([EmailVerificationEntity, PasswordResetEntity]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService): Promise<JwtModuleOptions> => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret) throw new Error('JWT_SECRET is missing in environment');

        const expiresIn = Number(config.get<string>('JWT_EXPIRES_IN_SECONDS') ?? 86400);

        return {
          secret,
          signOptions: { expiresIn },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [JwtModule],
})
export class AuthModule {}
