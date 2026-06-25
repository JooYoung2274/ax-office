import { IsIn, IsOptional } from 'class-validator';

/** GET /market-intel/briefings/:id/export?format=md|html */
export class ExportBriefingDto {
  @IsOptional()
  @IsIn(['md', 'html'])
  format: 'md' | 'html' = 'md';
}
