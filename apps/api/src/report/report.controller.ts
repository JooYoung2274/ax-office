import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Role } from '@axaxax/shared';
import { ReportService } from './report.service';
import { CommentDto, RejectReportDto } from './dto/report.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';

/**
 * ReportController — PRD §6.2 리포트 생명주기 워크플로.
 * 생성/조회/코멘트: STAFF 이상. 승인/반려: APPROVER(FINANCE_APPROVER/ADMIN).
 */
@Controller()
export class ReportController {
  constructor(private readonly reports: ReportService) {}

  /** POST /batches/:batchId/reports — AI 리포트 생성 트리거. */
  @Post('batches/:batchId/reports')
  @Roles(Role.FINANCE_STAFF, Role.FINANCE_APPROVER, Role.ADMIN)
  generate(@Param('batchId') batchId: string, @CurrentUser() user: AuthUser) {
    return this.reports.generate(batchId, user);
  }

  /** GET /reports/:reportId — 리포트 조회(Draft는 작성자/승인자만). */
  @Get('reports/:reportId')
  @Roles(Role.FINANCE_STAFF, Role.FINANCE_APPROVER, Role.ADMIN)
  get(@Param('reportId') reportId: string, @CurrentUser() user: AuthUser) {
    return this.reports.getReport(reportId, user);
  }

  /** POST /reports/:reportId/approve — 승인(APPROVER, self-approval 차단). */
  @Post('reports/:reportId/approve')
  @Roles(Role.FINANCE_APPROVER, Role.ADMIN)
  approve(@Param('reportId') reportId: string, @CurrentUser() user: AuthUser) {
    return this.reports.approve(reportId, user);
  }

  /** POST /reports/:reportId/reject — 반려(APPROVER, 사유 필수). */
  @Post('reports/:reportId/reject')
  @Roles(Role.FINANCE_APPROVER, Role.ADMIN)
  reject(
    @Param('reportId') reportId: string,
    @Body() dto: RejectReportDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.reports.reject(reportId, dto.reason, user);
  }

  /** POST /reports/:reportId/comments — 코멘트(finding 스레드). */
  @Post('reports/:reportId/comments')
  @Roles(Role.FINANCE_STAFF, Role.FINANCE_APPROVER, Role.ADMIN)
  comment(
    @Param('reportId') reportId: string,
    @Body() dto: CommentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.reports.addComment(reportId, dto.body, dto.findingId, user);
  }

  /** GET /reports/:reportId/export?format=pdf — 승인된 리포트만(미승인 403). */
  @Get('reports/:reportId/export')
  @Roles(Role.FINANCE_STAFF, Role.FINANCE_APPROVER, Role.ADMIN)
  export(
    @Param('reportId') reportId: string,
    @CurrentUser() user: AuthUser,
    @Query('format') _format?: string,
  ) {
    return this.reports.export(reportId, user);
  }
}
