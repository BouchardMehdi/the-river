import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { mkdirSync, writeFileSync } from 'fs';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUser } from '../auth/jwt.strategy';
import { UsersService } from './users.service';

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

@UseGuards(JwtAuthGuard)
@Controller('profile')
export class ProfileController {
  constructor(private readonly usersService: UsersService) {}

  @Get('avatars')
  async avatars(@Query('usernames') usernames = '') {
    const list = String(usernames)
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);
    return this.usersService.getAvatarsByUsernames(list);
  }

  @Post('avatar')
  @UseInterceptors(FileInterceptor('avatar', { limits: { fileSize: 2 * 1024 * 1024 } }))
  async uploadAvatar(@CurrentUser() user: JwtUser, @UploadedFile() file: any) {
    if (!file) throw new BadRequestException('AVATAR_REQUIRED');
    if (!allowedMimeTypes.has(String(file.mimetype))) throw new BadRequestException('INVALID_AVATAR_TYPE');

    const ext = this.safeExtension(file.originalname, file.mimetype);
    const dir = join(process.cwd(), 'uploads', 'avatars');
    mkdirSync(dir, { recursive: true });

    const filename = `${user.userId}-${randomUUID()}${ext}`;
    const absolutePath = join(dir, filename);
    writeFileSync(absolutePath, file.buffer);

    const avatarUrl = `/uploads/avatars/${filename}`;
    const updated = await this.usersService.setAvatarUrl(user.userId, avatarUrl);

    return {
      avatarUrl,
      user: {
        userId: updated.userId,
        username: updated.username,
        email: updated.email,
        emailVerified: updated.emailVerified,
        credits: updated.credits,
        points: updated.points ?? 0,
        avatarUrl: updated.avatarUrl ?? null,
      },
    };
  }

  private safeExtension(originalName: string, mimeType: string) {
    const ext = extname(originalName || '').toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) return ext;
    if (mimeType === 'image/png') return '.png';
    if (mimeType === 'image/webp') return '.webp';
    if (mimeType === 'image/gif') return '.gif';
    return '.jpg';
  }
}
