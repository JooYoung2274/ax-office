import { Controller, Get, Query } from '@nestjs/common';
import { Role } from '@axaxax/shared';
import { FinanceService } from './finance.service';
import { Roles } from '../auth/decorators/roles.decorator';

/**
 * FinanceController — 자금일보(cash)/월결산(closing) 도메인 대면 엔드포인트(thin).
 */
@Controller('finance')
@Roles(Role.FINANCE_STAFF, Role.FINANCE_APPROVER, Role.ADMIN)
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  /** GET /finance/dashboard — 처리 큐 + 유동성 경보(CRO flags) + 최근 활동. */
  @Get('dashboard')
  dashboard() {
    return this.finance.dashboard();
  }

  /** GET /finance/periods?domain=cash|closing — 기간 목록. */
  @Get('periods')
  periods(@Query('domain') domain: 'cash' | 'closing' = 'cash') {
    return this.finance.listPeriods(domain);
  }

  /** GET /finance/cash-daily?asOfDate= — 자금일보 요약(CashDailySummary). */
  @Get('cash-daily')
  cashDaily(@Query('asOfDate') asOfDate?: string) {
    return this.finance.cashDaily(asOfDate);
  }

  /** GET /finance/monthly-closing?period= — 월결산 요약(MonthlyClosingSummary). */
  @Get('monthly-closing')
  monthlyClosing(@Query('period') period?: string) {
    return this.finance.monthlyClosing(period);
  }
}
