import { Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Role } from '@axaxax/shared';
import { Roles } from '../auth/decorators/roles.decorator';
import { ExportBriefingDto } from './dto/export-briefing.dto';
import { MarketIntelService } from './market-intel.service';

/**
 * MarketIntelController(사업기획 — 시장·경쟁 인텔리전스). thin: HTTP 입출력만.
 */
@Controller('market-intel')
@Roles(Role.FINANCE_STAFF, Role.FINANCE_APPROVER, Role.ADMIN)
export class MarketIntelController {
  constructor(private readonly svc: MarketIntelService) {}

  /** POST /market-intel/run — 모니터링 수동 실행(브리핑 생성). */
  @Post('run')
  run() {
    return this.svc.run('manual');
  }

  /** GET /market-intel/briefings — 브리핑 목록. */
  @Get('briefings')
  list() {
    return this.svc.list();
  }

  /** GET /market-intel/briefings/latest — 최신 브리핑 상세. */
  @Get('briefings/latest')
  latest() {
    return this.svc.latest();
  }

  /** GET /market-intel/briefings/:id — 브리핑 상세. */
  @Get('briefings/:id')
  detail(@Param('id') id: string) {
    return this.svc.detail(id);
  }

  /** GET /market-intel/briefings/:id/export?format=md|html — 다운로드. */
  @Get('briefings/:id/export')
  async export(@Param('id') id: string, @Query() q: ExportBriefingDto, @Res({ passthrough: true }) res: Response) {
    const { content, mime, filename } = await this.svc.export(id, q.format);
    res.set({ 'Content-Type': mime, 'Content-Disposition': `attachment; filename="${filename}"` });
    return content;
  }
}
