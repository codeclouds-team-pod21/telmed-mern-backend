import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { safeParseDbJson } from '../../common/utils/json-db.util';
import { decryptStoredString } from '../../common/utils/encrypted-config.util';
import { MdiProvider } from '../doctor-network/providers/mdi.provider';
import { CrmOrderStatus } from '../order/order.enums';
import { OrderService } from '../order/order.service';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orderService: OrderService,
    private readonly mdiProvider: MdiProvider,
  ) {}

  async handleCrmOrderWebhook(payload: Record<string, any>) {
    const externalOrderId = payload?.webhook_data?.order?.id;
    if (!externalOrderId) {
      return { success: false, message: 'Order id missing' };
    }

    const order = await this.prisma.order.findFirst({
      where: { orderApiId: String(externalOrderId) },
    });

    if (!order) {
      return { success: false, message: 'Order not found' };
    }

    const shipping = payload?.webhook_data?.order?.customer_address_shipping;
    const billing = payload?.webhook_data?.order?.customer_address_billing;

    await this.prisma.order.update({
      where: { id: order.id },
      data: {
        shipFname: shipping?.fname ?? order.shipFname,
        shipLname: shipping?.lname ?? order.shipLname,
        shipAddress1: shipping?.address1 ?? order.shipAddress1,
        shipAddress2: shipping?.address2 ?? order.shipAddress2,
        shipCity: shipping?.city ?? order.shipCity,
        shipState: shipping?.state ?? order.shipState,
        shipZipcode: shipping?.zipcode ?? order.shipZipcode,
        billFname: billing?.fname ?? order.billFname,
        billLname: billing?.lname ?? order.billLname,
        billAddress1: billing?.address1 ?? order.billAddress1,
        billAddress2: billing?.address2 ?? order.billAddress2,
        billCity: billing?.city ?? order.billCity,
        billState: billing?.state ?? order.billState,
        billZipcode: billing?.zipcode ?? order.billZipcode,
      },
    });

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

  async handleDoctorNetworkWebhook(payload: Record<string, any>, signature?: string) {
    await this.verifyDoctorNetworkSignature(payload, signature);

    const eventType = payload?.event_type;
    const caseId = payload?.case_id ? String(payload.case_id) : null;

    if (!eventType) {
      return { success: false, message: 'event_type is required' };
    }

    if (caseId) {
      await this.prisma.userCase.updateMany({
        where: { caseId },
        data: {
          status: this.mapCaseStatus(eventType),
          reason: payload?.type_of_status ?? null,
        },
      });
    }

    if (eventType === 'case_completed' && caseId) {
      const completedCase = await this.prisma.userCase.findFirst({
        where: { caseId, deletedAt: null },
        include: { order: true },
        orderBy: { id: 'desc' },
      });

      if (
        completedCase?.order &&
        completedCase.order.orderStatus === CrmOrderStatus.authorized
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

  private mapCaseStatus(eventType: string) {
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
  ) {
    const environment = String(process.env.NODE_ENV ?? '').toLowerCase();
    if (['development', 'test', 'local', 'staging'].includes(environment)) {
      return;
    }

    const network = await this.prisma.doctorNetwork.findFirst({
      where: { type: 'mdi', status: true },
      orderBy: { id: 'asc' },
    });

    if (!network) {
      return;
    }

    const firstPass = safeParseDbJson<unknown>(network.credentials, {});
    const credentials =
      typeof firstPass === 'string'
        ? safeParseDbJson<Record<string, string>>(firstPass, {})
        : (firstPass as Record<string, string>);
    const secret = decryptStoredString(credentials.client_secret);
    if (!secret) {
      return;
    }

    if (!signature) {
      throw new BadRequestException('Missing Signature header');
    }

    const expected = createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');

    const provided = Buffer.from(signature.trim(), 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');

    if (
      provided.length !== expectedBuffer.length ||
      !timingSafeEqual(expectedBuffer, provided)
    ) {
      throw new BadRequestException('Invalid Signature');
    }
  }
}
