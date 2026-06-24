import { Controller, Get, Param, Post } from '@nestjs/common';
import { Role } from '@axaxax/shared';
import { CalcService } from './calc.service';
import { Roles } from '../auth/decorators/roles.decorator';

/**
 * CalcController — PRD §6.2 계산·검증 엔드포인트. FINANCE_STAFF 이상.
 */
@Controller('batches')
@Roles(Role.FINANCE_STAFF, Role.FINANCE_APPROVER, Role.ADMIN)
export class CalcController {
  constructor(private readonly calc: CalcService) {}

  /** POST /batches/:batchId/calculate — 계산·검증 재실행. */
  @Post(':batchId/calculate')
  calculate(@Param('batchId') batchId: string) {
    return this.calc.triggerCalc(batchId);
  }

  /** GET /batches/:batchId/cro — CRO 조회. */
  @Get(':batchId/cro')
  cro(@Param('batchId') batchId: string) {
    return this.calc.getCro(batchId);
  }

  /** GET /batches/:batchId/validation — 검증 리포트 조회. */
  @Get(':batchId/validation')
  validation(@Param('batchId') batchId: string) {
    return this.calc.getValidation(batchId);
  }
}
