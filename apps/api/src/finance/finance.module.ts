import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';

/**
 * FinanceModule — 슬라이스 A/B 도메인 오케스트레이션. PRD §6.1.
 */
@Module({
  controllers: [FinanceController],
  providers: [FinanceService],
})
export class FinanceModule {}
