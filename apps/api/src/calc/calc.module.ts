import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CalcController } from './calc.controller';
import { CalcService } from './calc.service';
import { CalcProcessor } from './calc.processor';
import { QUEUE_CALC } from '../common/constants';

/**
 * CalcModule — CalculationEngine + ValidationEngine 래핑. PRD §6.1.
 * ReportModule에 의존하지 않는다(계산은 AI 없이 독립 완결).
 */
@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_CALC })],
  controllers: [CalcController],
  providers: [CalcService, CalcProcessor],
  exports: [CalcService],
})
export class CalcModule {}
