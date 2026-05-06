import { Body, Controller, Param, ParseIntPipe, Post } from '@nestjs/common';
import { SupportService } from './support.service';
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';

@Controller('support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post('customers/:customerId')
  create(
    @Param('customerId', ParseIntPipe) customerId: number,
    @Body() dto: CreateSupportTicketDto,
  ) {
    return this.supportService.create(customerId, dto);
  }
}
