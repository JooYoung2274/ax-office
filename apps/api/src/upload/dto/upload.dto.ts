import { IsIn, IsObject, IsOptional, IsString, Matches } from 'class-validator';

/** 업로드 요청 메타(멀티파트의 텍스트 필드). */
export class CreateUploadDto {
  /** Prisma TemplateKey. */
  @IsString()
  templateKey!: string;

  /** 도메인. */
  @IsIn(['cash', 'closing', 'payroll'])
  domain!: 'cash' | 'closing' | 'payroll';

  /** 기간. 자금일보(cash)는 일자 YYYY-MM-DD, 월결산(closing)은 월 YYYY-MM (옵션). */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}(-\d{2})?$/, {
    message: 'period는 YYYY-MM 또는 YYYY-MM-DD 형식이어야 합니다.',
  })
  period?: string;
}

/** 컬럼 매핑 확정 DTO. sourceHeader → targetField. */
export class ConfirmMappingDto {
  @IsObject()
  mapping!: Record<string, string>;
}
