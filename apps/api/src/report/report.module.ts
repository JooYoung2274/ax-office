import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';
import { ReportProcessor } from './report.processor';
import { CalcModule } from '../calc/calc.module';
import { QUEUE_REPORT } from '../common/constants';

/**
 * ReportModule — ReportEngine(Claude) 통합. PRD §6.1.
 * 유일하게 ANTHROPIC_API_KEY를 사용한다(ReportProcessor 내부).
 * CalcModule에 의존(역방향만 허용 — Calc는 Report를 모른다).
 */
@Module({
  imports: [CalcModule, BullModule.registerQueue({ name: QUEUE_REPORT })],
  controllers: [ReportController],
  providers: [ReportService, ReportProcessor],
  exports: [ReportService],
})
export class ReportModule {}
