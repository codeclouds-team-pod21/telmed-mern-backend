import { Body, Controller, Headers, Post, Req } from '@nestjs/common';
import { WebhookService } from './webhook.service';

@Controller('webhooks')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post('order')
  handleOrderWebhook(@Body() payload: Record<string, any>) {
    const event = String(payload?.webhook_event ?? '').trim();

    if (!event) {
      return this.webhookService.handleCrmOrderWebhook(payload);
    }

    switch (event) {
      case 'order_updated':
        return this.webhookService.handleCrmOrderWebhook(payload);
      default:
        return {
          success: true,
          message: 'Event ignored',
          event,
        };
    }
  }

  @Post('transaction')
  handleTransactionWebhook(@Body() payload: Record<string, any>) {
    return this.webhookService.handleCrmTransactionWebhook(payload);
  }

  @Post('shipment')
  handleShipmentWebhook(@Body() payload: Record<string, any>) {
    return this.webhookService.handleCrmShipmentWebhook(payload);
  }

  @Post('mdintegration')
  handleDoctorNetworkWebhook(
    @Body() payload: Record<string, any>,
    @Headers('signature') signature?: string,
    @Req() request?: { rawBody?: string },
  ) {
    return this.webhookService.handleDoctorNetworkWebhook(
      payload,
      signature,
      request?.rawBody,
    );
  }
}
