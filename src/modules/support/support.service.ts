import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { stringifyDbJson } from '../../common/utils/json-db.util';
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  async create(customerId: number, dto: CreateSupportTicketDto) {
    const support = await this.prisma.support.create({
      data: {
        name: dto.name,
        email: dto.email,
        subject: dto.subject,
        message: dto.message,
        attachments: stringifyDbJson(dto.attachments ?? []),
        sentBy: customerId,
      },
    });

    return {
      success: true,
      support,
      externalSyncPending: true,
    };
  }
}
