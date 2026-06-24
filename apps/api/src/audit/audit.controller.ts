import { Controller, Get, Query } from '@nestjs/common';
import { Role } from '@axaxax/shared';
import { AuditService } from './audit.service';
import { Roles } from '../auth/decorators/roles.decorator';

/**
 * 감사 로그 조회 — PRD §6.2. ADMIN/APPROVER만.
 * append-only이므로 조회만 존재(수정/삭제 API 없음).
 */
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  /** GET /api/v1/audit-logs?targetType=&targetId=&action=&from=&to=&take=&skip= */
  @Get()
  @Roles(Role.FINANCE_APPROVER, Role.ADMIN)
  list(
    @Query('targetType') targetType?: string,
    @Query('targetId') targetId?: string,
    @Query('action') action?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.audit.query({
      targetType,
      targetId,
      action,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      take: take ? Number(take) : undefined,
      skip: skip ? Number(skip) : undefined,
    });
  }
}
