import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * PrismaService — PrismaClient 생명주기 관리.
 * NestJS 모듈 초기화/종료 훅에 DB 연결을 묶는다.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Prisma 연결 완료');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
