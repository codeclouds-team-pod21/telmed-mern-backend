import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { safeParseDbJson } from '../../common/utils/json-db.util';
import { decryptStoredString } from '../../common/utils/encrypted-config.util';
import { MdiProvider } from '../doctor-network/providers/mdi.provider';
import { CrmOrderStatus } from '../order/order.enums';
import { OrderService } from '../order/order.service';
import { OrderStatus } from '../order/order.enums';
import { CrmService } from '../crm/crm.service';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orderService: OrderService,
    private readonly mdiProvider: MdiProvider,
    private readonly crmService: CrmService,
  ) {}

  async handleCrmOrderWebhook(payload: Record<string, any>) {
    const externalOrderId = payload?.webhook_data?.order?.id;
    if (!externalOrderId) {
      return { success: false, message: 'Order id missing' };
    }

    const orders = await this.prisma.order.findMany({
      where: { orderApiId: String(externalOrderId) },
      include: {
        customer: true,
        items: {
          orderBy: { id: 'desc' },
          include: {
            productVariant: true,
          },
        },
      },
    });

    if (!orders.length) {
      return { success: false, message: 'Order not found' };
    }

    const order = orders[0];

    const shipping = payload?.webhook_data?.order?.customer_address_shipping;
    const billing = payload?.webhook_data?.order?.customer_address_billing;

    const crmOrderDetails = order.crmId
      ? ((await this.crmService.getOrderDetails(
          order.crmId,
          String(externalOrderId),
        )) as Record<string, any>)
      : null;

    const resolvedBilling = crmOrderDetails?.customer_address_billing ?? billing;
    const resolvedShipping = crmOrderDetails?.customer_address_shipping ?? shipping;
    for (const currentOrder of orders) {
      const mappedOrderStatus = this.resolveCrmWebhookOrderStatus(
        crmOrderDetails,
        currentOrder.orderOfferId,
      );

      await this.prisma.order.update({
        where: { id: currentOrder.id },
        data: {
          shipFname: resolvedShipping?.fname ?? currentOrder.shipFname,
          shipLname: resolvedShipping?.lname ?? currentOrder.shipLname,
          shipAddress1: resolvedShipping?.address1 ?? currentOrder.shipAddress1,
          shipAddress2: resolvedShipping?.address2 ?? currentOrder.shipAddress2,
          shipCity: resolvedShipping?.city ?? currentOrder.shipCity,
          shipState: resolvedShipping?.state ?? currentOrder.shipState,
          shipZipcode: resolvedShipping?.zipcode ?? currentOrder.shipZipcode,
          billFname: resolvedBilling?.fname ?? currentOrder.billFname,
          billLname: resolvedBilling?.lname ?? currentOrder.billLname,
          billAddress1: resolvedBilling?.address1 ?? currentOrder.billAddress1,
          billAddress2: resolvedBilling?.address2 ?? currentOrder.billAddress2,
          billCity: resolvedBilling?.city ?? currentOrder.billCity,
          billState: resolvedBilling?.state ?? currentOrder.billState,
          billZipcode: resolvedBilling?.zipcode ?? currentOrder.billZipcode,
          ...(mappedOrderStatus ? { status: mappedOrderStatus } : {}),
        },
      });
    }

    const crmCustomerEmail =
      this.stringOrNull(crmOrderDetails?.customer?.email) ??
      this.stringOrNull(payload?.webhook_data?.order?.customer?.email);

    if (order.customerId && crmCustomerEmail) {
      const incomingEmail = String(crmCustomerEmail).trim().toLowerCase();
      if (
        incomingEmail &&
        incomingEmail !== String(order.customer?.email ?? '').trim().toLowerCase()
      ) {
        const existingCustomer = await this.prisma.customer.findFirst({
          where: {
            email: incomingEmail,
            id: { not: order.customerId },
          },
          select: { id: true },
        });

        if (!existingCustomer) {
          await this.prisma.customer.update({
            where: { id: order.customerId },
            data: { email: incomingEmail },
          });
        }
      }
    }

    const savedBillingAddress = await this.upsertCustomerAddressFromWebhook(
      order.customerId,
      resolvedBilling,
      'billing',
    );
    const savedShippingAddress = await this.upsertCustomerAddressFromWebhook(
      order.customerId,
      resolvedShipping,
      'shipping',
    );

    if (savedBillingAddress || savedShippingAddress) {
      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          ...(savedBillingAddress
            ? { customerBillingAddressId: savedBillingAddress.id }
            : {}),
          ...(savedShippingAddress
            ? { customerShippingAddressId: savedShippingAddress.id }
            : {}),
        },
      });
    }

    return { success: true };
  }

  async handleCrmTransactionWebhook(payload: Record<string, any>) {
    const transaction = payload?.webhook_data?.transaction;
    const transactionId = transaction?.id;
    const externalOrderId = transaction?.order?.order_id;

    if (!transactionId || !externalOrderId) {
      return { success: false, message: 'Transaction payload incomplete' };
    }

    const order = await this.prisma.order.findFirst({
      where: { orderApiId: String(externalOrderId) },
    });

    if (!order) {
      return { success: false, message: 'Order not found' };
    }

    const orderTransaction = await this.prisma.orderTransaction.upsert({
      where: { transactionId: BigInt(transactionId) },
      update: {
        orderId: order.id,
        transactionId: BigInt(transactionId),
        shipmentId: transaction?.shipment?.shipment_id
          ? BigInt(transaction.shipment.shipment_id)
          : null,
        transactionCycle: String(transaction?.transaction_cycle ?? ''),
        transactionTotal: this.stringOrNull(transaction?.transaction_total),
        transactionPrice: this.stringOrNull(transaction?.transaction_price),
        transactionDiscountTotal: this.stringOrNull(
          transaction?.transaction_discount_total,
        ),
        transactionShipping: this.stringOrNull(transaction?.transaction_shipping),
        transactionSubTotal: this.stringOrNull(transaction?.transaction_sub_total),
        transactionTax: this.stringOrNull(transaction?.transaction_tax),
        transactionFee: this.stringOrNull(transaction?.transaction_fee),
        transactionTypeId: this.stringOrNull(transaction?.transaction_type_id),
        transactionDeclined: this.stringOrNull(
          transaction?.transaction_declined,
        ),
        gatewayResponseDescription: this.stringOrNull(
          transaction?.gateway_response_description,
        ),
        processorResponseText: this.stringOrNull(
          transaction?.processor_response_text,
        ),
        dateScheduled: transaction?.date_scheduled
          ? new Date(transaction.date_scheduled)
          : null,
        shipmentStatusId: transaction?.shipment?.shipment_status_id
          ? String(transaction.shipment.shipment_status_id)
          : null,
      },
      create: {
        orderId: order.id,
        transactionId: BigInt(transactionId),
        shipmentId: transaction?.shipment?.shipment_id
          ? BigInt(transaction.shipment.shipment_id)
          : null,
        transactionCycle: String(transaction?.transaction_cycle ?? ''),
        transactionTotal: this.stringOrNull(transaction?.transaction_total),
        transactionPrice: this.stringOrNull(transaction?.transaction_price),
        transactionDiscountTotal: this.stringOrNull(
          transaction?.transaction_discount_total,
        ),
        transactionShipping: this.stringOrNull(transaction?.transaction_shipping),
        transactionSubTotal: this.stringOrNull(transaction?.transaction_sub_total),
        transactionTax: this.stringOrNull(transaction?.transaction_tax),
        transactionFee: this.stringOrNull(transaction?.transaction_fee),
        transactionTypeId: transaction?.transaction_type_id
          ? String(transaction.transaction_type_id)
          : null,
        transactionDeclined: transaction?.transaction_declined ?? null,
        dateScheduled: transaction?.date_scheduled
          ? new Date(transaction.date_scheduled)
          : null,
        shipmentStatusId: transaction?.shipment?.shipment_status_id
          ? String(transaction.shipment.shipment_status_id)
          : null,
        gatewayResponseDescription: this.stringOrNull(
          transaction?.gateway_response_description,
        ),
        processorResponseText: this.stringOrNull(
          transaction?.processor_response_text,
        ),
      },
    });

    const isApprovedCapture =
      Number(transaction?.transaction_type_id) === 7 &&
      (Number(transaction?.gateway_response_code) === 100 ||
        Number(transaction?.response_code) === 100 ||
        String(transaction?.transaction_declined ?? '').toUpperCase() ===
          'APPROVED');

    if (isApprovedCapture) {
      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          orderStatus: CrmOrderStatus.captured,
          nextBillingAt: transaction?.rebill_date
            ? new Date(transaction.rebill_date)
            : order.nextBillingAt,
          nextScheduledRefillDate: transaction?.rebill_date
            ? new Date(transaction.rebill_date)
            : order.nextScheduledRefillDate,
        },
      });
    }

    return { success: true, orderTransaction };
  }

  async handleCrmShipmentWebhook(payload: Record<string, any>) {
    const shipment = payload?.webhook_data?.shipment;
    if (!shipment?.id || !shipment?.order_id) {
      return { success: false, message: 'Shipment payload incomplete' };
    }

    const order = await this.prisma.order.findFirst({
      where: { orderApiId: String(shipment.order_id) },
    });

    if (!order) {
      return { success: false, message: 'Order not found' };
    }

    await this.prisma.orderTransaction.updateMany({
      where: { orderId: order.id, shipmentId: BigInt(shipment.id) },
      data: {
        shipmentStatusId: shipment.shipment_status_id
          ? String(shipment.shipment_status_id)
          : null,
        shipmentTrackingId: shipment.shipment_tracking_id ?? null,
        dateDeliver: shipment.date_deliver ?? null,
      },
    });

    await this.prisma.order.update({
      where: { id: order.id },
      data: {
        trackingNumber: shipment.shipment_tracking_id ?? order.trackingNumber,
        nextScheduledRefillDate: shipment.date_scheduled
          ? new Date(shipment.date_scheduled)
          : order.nextScheduledRefillDate,
      },
    });

    return { success: true };
  }

  async handleDoctorNetworkWebhook(
    payload: Record<string, any>,
    signature?: string,
    rawBody?: string,
  ) {
    await this.verifyDoctorNetworkSignature(payload, signature, rawBody);

    const eventType = payload?.event_type;
    const caseId = payload?.case_id ? String(payload.case_id) : null;

    if (!eventType) {
      return { success: false, message: 'event_type is required' };
    }

    const mdiCase = caseId ? await this.fetchCaseSnapshot(caseId) : null;
    const resolvedStatus = this.resolveWebhookCaseStatus(eventType, mdiCase);
    const resolvedReason =
      this.resolveWebhookCaseReason(mdiCase) ??
      this.stringOrNull(payload?.type_of_status);

    if (caseId) {
      await this.prisma.userCase.updateMany({
        where: { caseId },
        data: {
          status: resolvedStatus,
          reason: resolvedReason,
        },
      });
    }

    if (eventType === 'case_completed' && caseId) {
      const completedCase = await this.prisma.userCase.findFirst({
        where: { caseId, deletedAt: null },
        include: { order: true },
        orderBy: { id: 'desc' },
      });

      const completionOutcome = await this.resolveCompletedCaseOutcome(caseId);

      if (completionOutcome.action === 'pause' && completedCase?.order) {
        await this.prisma.order.update({
          where: { id: completedCase.order.id },
          data: {
            status: OrderStatus.paused,
          },
        });
        this.logger.warn(
          `Paused order ${completedCase.order.id} after case ${caseId} completed: ${
            completionOutcome.reason ?? 'prescription mismatch'
          }`,
        );
      }

      if (completionOutcome.action === 'cancel' && completedCase?.order) {
        try {
          await this.orderService.cancelOrderFromDoctorNetwork(completedCase.order.id);
        } catch (error) {
          this.logger.error(
            `Failed to cancel completed order for case ${caseId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      if (
        completionOutcome.action === 'capture' &&
        completedCase?.order &&
        completedCase.order.orderStatus === CrmOrderStatus.authorized &&
        completedCase.order.crmId &&
        completedCase.order.orderApiId
      ) {
        try {
          await this.orderService.captureAuthorizedOrder(completedCase.order.id);
        } catch (error) {
          this.logger.error(
            `Failed to capture authorized order for case ${caseId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      if (completedCase?.order) {
        await this.prisma.order.update({
          where: { id: completedCase.order.id },
          data: {
            expiresAt:
              completedCase.order.expiresAt ??
              this.plusOneYear(completedCase.order.createdAt ?? new Date()),
          },
        });
      }
    }

    if (eventType === 'case_cancelled' && caseId) {
      const cancelledCase = await this.prisma.userCase.findFirst({
        where: { caseId, deletedAt: null },
        include: { order: true },
        orderBy: { id: 'desc' },
      });

      if (
        cancelledCase?.order?.crmId &&
        cancelledCase.order.orderOfferId &&
        cancelledCase.order.status !== OrderStatus.cancelled
      ) {
        try {
          await this.orderService.cancelOrderFromDoctorNetwork(cancelledCase.order.id);
        } catch (error) {
          this.logger.error(
            `Failed to cancel order for case ${caseId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }

    if (eventType === 'message_created' && payload?.patient_id) {
      await this.syncDoctorNetworkMessages(String(payload.patient_id));
    }

    this.logger.log(`Processed doctor network webhook: ${eventType}`);
    return { success: true };
  }

  private stringOrNull(value: unknown) {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    return String(value);
  }

  private async syncDoctorNetworkMessages(patientId: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { doctorNetworkPatientId: patientId },
      include: {
        doctorNetwork: true,
        userCases: {
          where: { deletedAt: null },
          orderBy: { id: 'desc' },
          take: 1,
        },
      },
    });

    if (!patient?.doctorNetwork) {
      return;
    }

    const payload = (await this.mdiProvider.getMessagesByPatient(
      {
        id: patient.doctorNetwork.id,
        apiUrl: patient.doctorNetwork.apiUrl,
        apiVersion: patient.doctorNetwork.apiVersion,
        credentials: patient.doctorNetwork.credentials,
      },
      patientId,
    )) as Record<string, any>;

    const messages = Array.isArray(payload?.data?.data)
      ? payload.data.data
      : Array.isArray(payload?.data)
        ? payload.data
        : [];

    for (const message of messages) {
      const externalMessageId = String(message?.id ?? '').trim();
      if (!externalMessageId) {
        continue;
      }

      const existing = await this.prisma.caseMessage.findFirst({
        where: { caseMessageId: externalMessageId },
        select: { id: true },
      });
      if (existing) {
        continue;
      }

      const fullName =
        String(message?.user?.full_name ?? '').trim() ||
        `${String(message?.user?.first_name ?? '').trim()} ${String(
          message?.user?.last_name ?? '',
        ).trim()}`.trim() ||
        null;

      const savedMessage = await this.prisma.caseMessage.create({
        data: {
          patientId: patient.id,
          caseId: patient.userCases[0]?.id ?? null,
          from: this.mapMessageSender(message?.user_type),
          fullName,
          text: this.stringOrNull(message?.text),
          caseMessageId: externalMessageId,
          seen: null,
          createdAt: this.parseDateOrNull(message?.created_at),
        },
      });

      const files = Array.isArray(message?.files) ? message.files : [];
      for (const file of files) {
        const path =
          this.stringOrNull(file?.path) ?? this.stringOrNull(file?.url);
        if (!path) {
          continue;
        }

        await this.prisma.document.create({
          data: {
            path,
            publicUrl: this.stringOrNull(file?.url),
            type: 'OTHERS',
            doctorsNetworkId: patient.doctorNetworkId,
            doctorNetworkFileId: this.stringOrNull(file?.id),
            customerId: patient.customerId,
            caseId: patient.userCases[0]?.id ?? null,
            resourceId: savedMessage.id,
            resourceType: 'case_message',
          },
        });
      }
    }
  }

  private mapMessageSender(value: unknown) {
    const normalized = String(value ?? '').toLowerCase();

    if (normalized.includes('clinician')) {
      return 'clinician';
    }
    if (normalized.includes('support')) {
      return 'support';
    }
    if (normalized.includes('patient')) {
      return 'patient';
    }

    return 'clinician';
  }

  private parseDateOrNull(value: unknown) {
    if (!value) {
      return null;
    }

    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private async verifyDoctorNetworkSignature(
    payload: Record<string, any>,
    signature?: string,
    rawBody?: string,
  ) {
    const environment = String(process.env.NODE_ENV ?? '').toLowerCase();
    if (['development', 'test', 'local', 'staging'].includes(environment)) {
      return;
    }

    const networks = await this.prisma.doctorNetwork.findMany({
      where: { type: 'mdi', status: true },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        credentials: true,
      },
    });

    if (!networks.length) {
      return;
    }

    if (!signature) {
      throw new BadRequestException('Missing Signature header');
    }

    const normalizedSignature = this.normalizeWebhookSignature(signature);
    const requestBody = rawBody ?? JSON.stringify(payload);

    for (const network of networks) {
      for (const secret of this.extractDoctorNetworkWebhookSecrets(network.credentials)) {
        const expected = createHmac('sha256', secret)
          .update(requestBody)
          .digest('hex');

        const provided = Buffer.from(normalizedSignature, 'utf8');
        const expectedBuffer = Buffer.from(expected, 'utf8');

        if (
          provided.length === expectedBuffer.length &&
          timingSafeEqual(expectedBuffer, provided)
        ) {
          return;
        }
      }
    }

    throw new BadRequestException('Invalid Signature');
  }

  private extractDoctorNetworkWebhookSecrets(credentialsJson: string | null) {
    if (!credentialsJson) {
      return [] as string[];
    }

    const firstPass = safeParseDbJson<unknown>(credentialsJson, {});
    const credentials =
      typeof firstPass === 'string'
        ? safeParseDbJson<Record<string, string>>(firstPass, {})
        : (firstPass as Record<string, string>);

    return [
      decryptStoredString(credentials.webhook_secret) ??
        String(credentials.webhook_secret ?? '').trim(),
      decryptStoredString(credentials.client_secret) ??
        String(credentials.client_secret ?? '').trim(),
    ].filter((value, index, values) => Boolean(value) && values.indexOf(value) === index);
  }

  private normalizeWebhookSignature(signature: string) {
    const trimmed = signature.trim();
    return trimmed.toLowerCase().startsWith('sha256=')
      ? trimmed.slice('sha256='.length).trim()
      : trimmed;
  }

  private async fetchCaseSnapshot(caseId: string) {
    const userCase = await this.prisma.userCase.findFirst({
      where: { caseId, deletedAt: null },
      include: {
        patient: {
          include: {
            doctorNetwork: true,
          },
        },
      },
      orderBy: { id: 'desc' },
    });

    if (!userCase?.patient?.doctorNetwork) {
      return null;
    }

    try {
      return (await this.mdiProvider.getCase(
        {
          id: userCase.patient.doctorNetwork.id,
          apiUrl: userCase.patient.doctorNetwork.apiUrl,
          apiVersion: userCase.patient.doctorNetwork.apiVersion,
          credentials: userCase.patient.doctorNetwork.credentials,
        },
        caseId,
      )) as Record<string, any>;
    } catch {
      return null;
    }
  }

  private async fetchCasePrescriptions(caseId: string) {
    const userCase = await this.prisma.userCase.findFirst({
      where: { caseId, deletedAt: null },
      include: {
        patient: {
          include: {
            doctorNetwork: true,
          },
        },
      },
      orderBy: { id: 'desc' },
    });

    if (!userCase?.patient?.doctorNetwork) {
      return [] as Array<Record<string, any>>;
    }

    try {
      const payload = (await this.mdiProvider.getCasePrescriptions(
        {
          id: userCase.patient.doctorNetwork.id,
          apiUrl: userCase.patient.doctorNetwork.apiUrl,
          apiVersion: userCase.patient.doctorNetwork.apiVersion,
          credentials: userCase.patient.doctorNetwork.credentials,
        },
        caseId,
      )) as Record<string, any>;

      if (Array.isArray(payload?.data)) {
        return payload.data as Array<Record<string, any>>;
      }

      if (Array.isArray(payload?.data?.data)) {
        return payload.data.data as Array<Record<string, any>>;
      }

      return Array.isArray(payload) ? payload : [];
    } catch {
      return [];
    }
  }

  private async resolveCompletedCaseOutcome(caseId: string) {
    const userCase = await this.prisma.userCase.findFirst({
      where: { caseId, deletedAt: null },
      include: {
        order: {
          include: {
            items: {
              orderBy: { id: 'desc' },
              take: 1,
              include: {
                productVariant: {
                  include: {
                    product: {
                      include: {
                        relatedItems: {
                          include: {
                            additionalProduct: {
                              include: {
                                variants: {
                                  where: { deletedAt: null },
                                  select: { docNetworkOfferingId: true },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { id: 'desc' },
    });

    const order = userCase?.order;
    const latestItem = order?.items?.[0];
    const variant = latestItem?.productVariant;

    if (!order || !variant) {
      return { action: 'capture' as const };
    }

    const prescriptions = await this.fetchCasePrescriptions(caseId);
    if (!prescriptions.length) {
      return {
        action: 'none' as const,
        reason: 'No prescriptions returned by doctor network.',
      };
    }

    const allowedOfferingIds = this.collectAllowedOfferingIds(variant);
    const prescribedOfferingIds = prescriptions
      .map((item) => String(item?.offerable_id ?? '').trim())
      .filter(Boolean);

    if (!prescribedOfferingIds.length) {
      return {
        action: 'none' as const,
        reason: 'Doctor network prescriptions are missing offering ids.',
      };
    }

    const mismatch = prescribedOfferingIds.some(
      (offeringId) => !allowedOfferingIds.has(offeringId),
    );

    if (!mismatch) {
      return { action: 'capture' as const };
    }

    if (order.orderStatus === CrmOrderStatus.captured) {
      return {
        action: 'cancel' as const,
        reason: 'Doctor prescribed a different offering than the authorized treatment.',
      };
    }

    return {
      action: 'pause' as const,
      reason: 'Doctor prescribed a different offering than the authorized treatment.',
    };
  }

  private collectAllowedOfferingIds(variant: {
    docNetworkOfferingId: string;
    isSupplyAvailable: boolean;
    isTitrationAvailable: boolean;
    product: {
      relatedItems: Array<{
        type: string;
        additionalProduct: {
          variants: Array<{ docNetworkOfferingId: string }>;
        };
      }>;
    };
  }) {
    const offerings = new Set<string>();

    if (variant.docNetworkOfferingId) {
      offerings.add(String(variant.docNetworkOfferingId).trim());
    }

    for (const related of variant.product.relatedItems) {
      if (related.type === 'supply' && !variant.isSupplyAvailable) {
        continue;
      }

      if (related.type === 'titration' && !variant.isTitrationAvailable) {
        continue;
      }

      for (const relatedVariant of related.additionalProduct.variants) {
        const offeringId = String(relatedVariant.docNetworkOfferingId ?? '').trim();
        if (offeringId) {
          offerings.add(offeringId);
        }
      }
    }

    return offerings;
  }

  private resolveWebhookCaseStatus(
    eventType: string,
    mdiCase: Record<string, any> | null,
  ) {
    if (eventType === 'case_completed') {
      return 'completed';
    }

    if (eventType === 'case_cancelled') {
      return 'cancelled';
    }

    const caseStatus =
      this.stringOrNull(mdiCase?.case_status?.name) ??
      this.stringOrNull(mdiCase?.status);

    if (caseStatus) {
      return caseStatus;
    }

    switch (eventType) {
      case 'case_assigned_to_clinician':
        return 'assigned';
      case 'case_transferred_to_support':
        return 'support';
      case 'case_created':
        return 'created';
      default:
        return eventType.replace(/^case_/, '');
    }
  }

  private resolveWebhookCaseReason(mdiCase: Record<string, any> | null) {
    return (
      this.stringOrNull(mdiCase?.case_status?.reason) ??
      this.stringOrNull(mdiCase?.type_of_status) ??
      null
    );
  }

  private resolveCrmWebhookOrderStatus(
    crmOrderDetails: Record<string, any> | null,
    orderOfferId?: string | null,
  ) {
    const orderOffers = Array.isArray(crmOrderDetails?.order_offers)
      ? crmOrderDetails.order_offers
      : Array.isArray(crmOrderDetails?.order?.order_offers)
        ? crmOrderDetails.order.order_offers
        : [];

    const matchedOffer =
      orderOffers.find(
        (offer: Record<string, any>) =>
          String(offer?.order_offer_id ?? '').trim() ===
          String(orderOfferId ?? '').trim(),
      ) ?? orderOffers[0];

    const statusTypeId = Number(matchedOffer?.status_type_id ?? 0);
    switch (statusTypeId) {
      case 4:
        return OrderStatus.partial;
      case 7:
        return OrderStatus.rejected;
      case 8:
        return OrderStatus.removed;
      case 10:
        return OrderStatus.expired;
      default:
        return null;
    }
  }

  private async upsertCustomerAddressFromWebhook(
    customerId: number,
    source: Record<string, any> | undefined,
    type: 'billing' | 'shipping',
  ) {
    if (!source?.customer_address_id) {
      return null;
    }

    const crmAddressId = String(source.customer_address_id).trim();
    if (!crmAddressId) {
      return null;
    }

    const existing = await this.prisma.customerAddress.findFirst({
      where: {
        customerId,
        crmAddressId,
        type,
      },
      select: { id: true },
    });

    const payload = {
      customerId,
      crmAddressId,
      fname: this.stringOrNull(source.fname) ?? '',
      lname: this.stringOrNull(source.lname) ?? '',
      address1: this.stringOrNull(source.address1) ?? '',
      address2: this.stringOrNull(source.address2),
      city: this.stringOrNull(source.city),
      state: this.stringOrNull(source.state) ?? '',
      country: this.stringOrNull(source.country) ?? 'US',
      zipCode: this.stringOrNull(source.zipcode),
      type,
      makeDefault: false,
    } as const;

    if (existing) {
      return this.prisma.customerAddress.update({
        where: { id: existing.id },
        data: payload,
      });
    }

    return this.prisma.customerAddress.create({
      data: payload,
    });
  }

  private plusOneYear(date: Date) {
    const next = new Date(date);
    next.setFullYear(next.getFullYear() + 1);
    return next;
  }
}
