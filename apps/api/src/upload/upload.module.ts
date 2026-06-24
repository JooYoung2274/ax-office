import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { ParseProcessor } from './parse.processor';
import { QUEUE_CALC, QUEUE_PARSE } from '../common/constants';

/**
 * UploadModule (DataConnector) — PRD §6.1.
 * parse-queue 생산/소비, calc-queue로 enqueue.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_PARSE }, { name: QUEUE_CALC }),
  ],
  controllers: [UploadController],
  providers: [UploadService, ParseProcessor],
  exports: [UploadService],
})
export class UploadModule {}
