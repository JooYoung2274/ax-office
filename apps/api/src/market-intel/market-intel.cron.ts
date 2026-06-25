import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MarketIntelService } from './market-intel.service';

/**
 * 주간 자동 모니터링 — 매주 월요일 오전 8시(서버 TZ).
 * 요청 컨텍스트가 없으므로 TenantContextService는 DEFAULT 테넌트로 동작.
 */
@Injectable()
export class MarketIntelCron {
  private readonly log = new Logger(MarketIntelCron.name);

  constructor(private readonly svc: MarketIntelService) {}

  @Cron(CronExpression.EVERY_WEEK, { name: 'market-intel-weekly' })
  async weekly() {
    try {
      const b = await this.svc.run('cron');
      this.log.log(`주간 브리핑 생성 완료: ${b.id} (신규 ${b.itemCount}건)`);
    } catch (e) {
      this.log.error(`주간 브리핑 실패: ${String(e)}`);
    }
  }
}
