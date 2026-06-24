import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@axaxax/shared';
import { UploadService } from './upload.service';
import { templatesForDomain } from './templates';
import { ConfirmMappingDto, CreateUploadDto } from './dto/upload.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';

/**
 * UploadController (DataConnector) — PRD §6.2 업로드 엔드포인트.
 * 모든 액션은 FINANCE_STAFF 이상.
 */
@Controller('upload')
@Roles(Role.FINANCE_STAFF, Role.FINANCE_APPROVER, Role.ADMIN)
export class UploadController {
  constructor(private readonly upload: UploadService) {}

  /** GET /upload/templates?domain=cash|closing */
  @Get('templates')
  templates(@Query('domain') domain?: 'cash' | 'closing') {
    return { templates: templatesForDomain(domain) };
  }

  /** POST /upload/files — 멀티파트 업로드. */
  @Post('files')
  @UseInterceptors(FileInterceptor('file'))
  uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateUploadDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.upload.receiveFile(file, dto, {
      userId: user.userId,
      tenantId: user.tenantId,
    });
  }

  /** GET /upload/batches/:batchId/mapping-candidates */
  @Get('batches/:batchId/mapping-candidates')
  mappingCandidates(@Param('batchId') batchId: string) {
    return this.upload.getMappingCandidates(batchId);
  }

  /** POST /upload/batches/:batchId/mapping — 매핑 확정 → calc enqueue. */
  @Post('batches/:batchId/mapping')
  confirmMapping(
    @Param('batchId') batchId: string,
    @Body() dto: ConfirmMappingDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.upload.confirmMapping(batchId, dto.mapping, user.userId);
  }

  /** GET /upload/batches/:batchId — 상태/진행률(SSE 폴백). */
  @Get('batches/:batchId')
  batchStatus(@Param('batchId') batchId: string) {
    return this.upload.getBatchStatus(batchId);
  }
}
