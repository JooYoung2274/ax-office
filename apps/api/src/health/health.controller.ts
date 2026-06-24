import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';

/** 헬스체크 — Public(인증 불필요). */
@Controller()
export class HealthController {
  /** GET /health */
  @Public()
  @Get('health')
  health() {
    return { status: 'ok', service: '@axaxax/api', time: new Date().toISOString() };
  }
}
