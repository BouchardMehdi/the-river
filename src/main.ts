import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  process.on('unhandledRejection', (reason: any) => {
    console.error('[fatal] unhandledRejection:', reason);
  });

  process.on('uncaughtException', (err: any) => {
    console.error('[fatal] uncaughtException:', err);
  });

  const app = await NestFactory.create(AppModule);

  // ✅ CORS HTTP pour login + fetch HTML
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('API Casino')
    .setDescription('API Casino (NestJS + TypeORM + MySQL)')
    .setVersion('1.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
      'jwt',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);

  console.log(`API running on http://127.0.0.1:${port}`);
  console.log(`Swagger UI  on http://127.0.0.1:${port}/api`);
}

bootstrap();
