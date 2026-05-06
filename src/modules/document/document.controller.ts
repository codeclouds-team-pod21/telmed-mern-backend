import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { DocumentService } from './document.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { UploadSsnDto } from './dto/upload-ssn.dto';
import { UploadVideoDto } from './dto/upload-video.dto';

@Controller('documents')
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Get('customers/:customerId/status')
  getStatus(
    @Param('customerId', ParseIntPipe) customerId: number,
    @Query('productVariantId', ParseIntPipe) productVariantId: number,
  ) {
    return this.documentService.getDocumentStatus(customerId, productVariantId);
  }

  @Post('customers/:customerId/id')
  uploadDocument(
    @Param('customerId', ParseIntPipe) customerId: number,
    @Body() dto: UploadDocumentDto,
  ) {
    return this.documentService.uploadDocument(customerId, dto);
  }

  @Post('customers/:customerId/ssn')
  uploadSsn(
    @Param('customerId', ParseIntPipe) customerId: number,
    @Body() dto: UploadSsnDto,
  ) {
    return this.documentService.uploadSsn(customerId, dto);
  }

  @Post('customers/:customerId/video')
  uploadVideo(
    @Param('customerId', ParseIntPipe) customerId: number,
    @Body() dto: UploadVideoDto,
  ) {
    return this.documentService.uploadVideo(customerId, dto);
  }

  @Post('customers/:customerId/cases')
  createCase(
    @Param('customerId', ParseIntPipe) customerId: number,
    @Body('productVariantId', ParseIntPipe) productVariantId: number,
  ) {
    return this.documentService.createCaseForCustomer(customerId, productVariantId);
  }

  @Post('background-verification')
  startBackgroundVerification(@Body('orderId') orderId?: number) {
    return this.documentService.startBackgroundVerification(orderId);
  }
}
