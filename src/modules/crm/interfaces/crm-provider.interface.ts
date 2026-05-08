export interface CrmProvider {
  readonly type: string;
  createPartialOrder(data: Record<string, unknown>, mapping: Record<string, unknown>): Promise<unknown>;
  createOrder(data: Record<string, unknown>, mapping: Record<string, unknown>): Promise<unknown>;
  createSwapAuthorizeOrder(data: Record<string, unknown>, mapping: Record<string, unknown>): Promise<unknown>;
  captureOrder(orderId: string, mapping: Record<string, unknown>): Promise<unknown>;
  cancelOrder(orderOfferId: string, credentials: unknown): Promise<unknown>;
  refundOrder(transactionId: string, refundAmount: string | number, credentials: unknown): Promise<unknown>;
  checkOrderOffer(data: Record<string, unknown>, mapping: Record<string, unknown>): Promise<unknown>;
  validateCoupon(offerId: string, couponCode: string, mapping: Record<string, unknown>): Promise<unknown>;
  calculateDiscount(offerId: string, mapping: Record<string, unknown>, couponCode?: string | null): Promise<unknown>;
  getCrmData(credentials: unknown): Promise<unknown>;
  getOrderDetails(orderId: string, credentials: unknown): Promise<unknown>;
  getCustomerCards(customerId: string, credentials: unknown): Promise<unknown>;
  updateOrder(orderId: string, variantId: number | null, payload: Record<string, unknown>): Promise<unknown>;
}
