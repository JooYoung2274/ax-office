import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

/**
 * 부트스트랩 — PRD §6.
 *  - 전역 prefix /api/v1
 *  - 전역 ValidationPipe(whitelist, transform)
 *  - CORS(웹 오리진)
 *  - API_PORT 리슨
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // DTO에 없는 속성 제거
      forbidNonWhitelisted: false,
      transform: true, // payload → DTO 인스턴스 변환
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const webOrigin = process.env.VITE_API_BASE_URL ?? 'http://localhost:5173';
  app.enableCors({
    origin: [webOrigin, 'http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
  });

  const port = Number(process.env.API_PORT ?? 3000);
  await app.listen(port);
  new Logger('Bootstrap').log(`@axaxax/api 기동: http://localhost:${port}/api/v1 (health: /api/v1/health)`);
}

void bootstrap();
