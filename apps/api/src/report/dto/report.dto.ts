import { IsOptional, IsString, MinLength } from 'class-validator';

/** 반려 사유 DTO(필수). */
export class RejectReportDto {
  @IsString()
  @MinLength(1, { message: '반려 사유는 필수입니다.' })
  reason!: string;
}

/** 코멘트 DTO(finding 단위 스레드). */
export class CommentDto {
  @IsString()
  @MinLength(1)
  body!: string;

  @IsOptional()
  @IsString()
  findingId?: string;
}
