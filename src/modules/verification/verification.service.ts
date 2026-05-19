import { Injectable } from '@nestjs/common';
import { SmartyAddressProvider } from './providers/smarty-address.provider';
import { XVerifyEmailProvider } from './providers/xverify-email.provider';
import {
  AddressVerificationInput,
  AddressVerificationResult,
  EmailVerificationResult,
} from './verification.types';

@Injectable()
export class VerificationService {
  constructor(
    private readonly xverifyEmailProvider: XVerifyEmailProvider,
    private readonly smartyAddressProvider: SmartyAddressProvider,
  ) {}

  verifyEmail(email: string): Promise<EmailVerificationResult> {
    return this.xverifyEmailProvider.verifyEmail(email);
  }

  validateAddress(
    input: AddressVerificationInput,
  ): Promise<AddressVerificationResult> {
    return this.smartyAddressProvider.validateAddress(input);
  }
}
