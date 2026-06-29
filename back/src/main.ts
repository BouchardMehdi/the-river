import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

const LOCAL_DEV_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

function isEnabled(value: string | undefined, fallback = false): boolean {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function parseCorsOrigin(raw: string | undefined, isProduction: boolean): string[] | boolean {
  if (!raw || raw.trim() === '') return isProduction ? false : LOCAL_DEV_ORIGINS;
  if (raw.trim() === '*') return !isProduction;
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

async function bootstrap() {
  process.on('unhandledRejection', (reason: unknown) => {
    console.error('[fatal] unhandledRejection:', reason);
  });

  process.on('uncaughtException', (err: unknown) => {
    console.error('[fatal] uncaughtException:', err);
  });

  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const nodeEnv = configService.get<string>('NODE_ENV') ?? 'development';
  const isProduction = nodeEnv === 'production';

  app.use((_: unknown, res: any, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  app.enableCors({
    origin: parseCorsOrigin(
      configService.get<string>('CORS_ORIGINS') ?? configService.get<string>('CORS_ORIGIN'),
      isProduction,
    ),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
    }),
  );

  const swaggerEnabled = isEnabled(configService.get<string>('SWAGGER_ENABLED'), !isProduction);
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('THE RIVER API')
      .setDescription('API THE RIVER (NestJS + TypeORM + MySQL)')
      .setVersion('1.0.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
        'jwt',
      )
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  const port = Number(configService.get<string>('PORT') ?? 3000);
  await app.listen(port);

  console.log(`API running on http://127.0.0.1:${port}`);
  if (swaggerEnabled) console.log(`Swagger UI on http://127.0.0.1:${port}/api`);
}

bootstrap();
