import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { normalizeBigInts } from '../../common/utils/bigint.util';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateCustomerProfileDto } from './dto/update-customer-profile.dto';
import { UpsertCustomerAddressDto } from './dto/upsert-customer-address.dto';
import { CreateFunnelCustomerDto } from './dto/create-funnel-customer.dto';
import { hashCustomerPassword } from './customer-password.util';
import { FunnelStep } from '@prisma/client';

@Injectable()
export class CustomerService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensurePublicFunnelProduct(funnelProductId: number) {
    const funnelProduct = await this.prisma.funnelProduct.findFirst({
      where: {
        id: funnelProductId,
        status: true,
        deletedAt: null,
        funnel: {
          status: true,
          displayDefault: false,
          deletedAt: null,
        },
        product: {
          status: true,
          deletedAt: null,
        },
      },
      select: { id: true },
    });

    if (!funnelProduct) {
      throw new NotFoundException('Funnel product not found');
    }
  }

  async listAdminCustomers(searchText?: string, status?: boolean) {
    const customers = await this.prisma.customer.findMany({
      where: {
        ...(typeof status === 'boolean' ? { status } : {}),
        ...(searchText
          ? {
              OR: [
                { email: { contains: searchText } },
                { firstName: { contains: searchText } },
                { lastName: { contains: searchText } },
                { phone: { contains: searchText } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        status: true,
        createdAt: true,
        _count: {
          select: {
            addresses: true,
            orders: true,
          },
        },
      },
      orderBy: { id: 'desc' },
    });

    return normalizeBigInts(
      customers.map((customer) => ({
        id: customer.id,
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phone: customer.phone,
        status: customer.status,
        createdAt: customer.createdAt,
        addressCount: customer._count.addresses,
        orderCount: customer._count.orders,
      })),
    );
  }

  async createFunnelCustomer(dto: CreateFunnelCustomerDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.customer.findUnique({
      where: { email },
    });

    if (existing) {
      throw new ConflictException('A customer with this email already exists');
    }

    const customer = await this.prisma.customer.create({
      data: {
        email,
        password: hashCustomerPassword(dto.password),
        firstName: dto.firstName.trim(),
        lastName: dto.lastName?.trim() || null,
        phone: dto.phone ? dto.phone.replace(/\D/g, '').slice(0, 15) : null,
        metadata: dto.state ? JSON.stringify({ state: dto.state }) : null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    if (dto.funnelProductId) {
      await this.ensurePublicFunnelProduct(dto.funnelProductId);

      const existingProgress = await this.prisma.funnelProgress.findFirst({
        where: {
          customerId: customer.id,
          funnelProductId: dto.funnelProductId,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (existingProgress) {
        await this.prisma.funnelProgress.update({
          where: { id: existingProgress.id },
          data: { steps: FunnelStep.medical_question },
        });
      } else {
        await this.prisma.funnelProgress.create({
          data: {
            customerId: customer.id,
            funnelProductId: dto.funnelProductId,
            steps: FunnelStep.medical_question,
            smsConsent: false,
          },
        });
      }
    }

    return normalizeBigInts({
      success: true,
      customer: {
        id: customer.id,
        email: customer.email,
        firstName: customer.firstName,
        lastName: customer.lastName,
        phone: customer.phone,
      },
    });
  }

  async getDashboard(customerId: number, status?: string) {
    const orders = await this.prisma.order.findMany({
      where: {
        customerId,
        ...(status ? { status: status as never } : {}),
      },
      include: {
        items: {
          include: {
            productVariant: {
              include: { product: true },
            },
          },
        },
        funnel: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return normalizeBigInts({
      orders,
      portalConfiguration: await this.prisma.portalConfiguration.findFirst(),
    });
  }

  async getProfile(customerId: number) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        addresses: { orderBy: { id: 'desc' } },
        crmCustomers: { include: { crm: true } },
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return normalizeBigInts({
      customer,
      portalConfiguration: await this.prisma.portalConfiguration.findFirst(),
    });
  }

  async getFunnelProgress(customerId: number, funnelProductId: number) {
    await this.ensurePublicFunnelProduct(funnelProductId);

    const progress = await this.prisma.funnelProgress.findFirst({
      where: {
        customerId,
        funnelProductId,
        deletedAt: null,
      },
      orderBy: { id: 'desc' },
    });

    return normalizeBigInts({ progress });
  }

  async updateProfile(customerId: number, dto: UpdateCustomerProfileDto) {
    const customer = await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone ?? null,
      },
    });

    return normalizeBigInts({ success: true, customer });
  }

  async upsertAddress(customerId: number, dto: UpsertCustomerAddressDto) {
    const existing = dto.id
      ? await this.prisma.customerAddress.findFirst({
          where: { id: dto.id, customerId },
        })
      : null;

    const data = {
      customerId,
      fname: dto.fname,
      lname: dto.lname,
      address1: dto.address1,
      address2: dto.address2 ?? null,
      country: dto.country,
      state: dto.state,
      city: dto.city,
      zipCode: dto.zipCode,
      makeDefault: dto.makeDefault ?? false,
      type: dto.type ?? 'shipping',
      crmAddressId: dto.crmAddressId ?? null,
    };

    const address = existing
      ? await this.prisma.customerAddress.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.customerAddress.create({ data });

    return normalizeBigInts({ success: true, address });
  }

  async deleteAddress(customerId: number, addressId: number) {
    const address = await this.prisma.customerAddress.findFirst({
      where: { id: addressId, customerId },
    });

    if (!address) {
      throw new NotFoundException('Address not found');
    }

    await this.prisma.customerAddress.delete({ where: { id: addressId } });
    return { success: true };
  }

  async getTreatmentDetails(customerId: number, orderId: number) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId },
      include: {
        items: {
          include: {
            productVariant: {
              include: { product: true },
            },
          },
        },
        transactions: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const variant = order.items[0]?.productVariant;
    const swappableProducts = variant
      ? await this.prisma.swappableProduct.findMany({
          where: { productId: variant.productId },
          include: { swapableProduct: true },
        })
      : [];

    return normalizeBigInts({ order, swappableProducts });
  }
}
