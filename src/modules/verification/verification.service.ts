import { Injectable } from '@nestjs/common';
import { SmartyAddressProvider } from './providers/smarty-address.provider';
import { VouchedSsnProvider } from './providers/vouched-ssn.provider';
import { XVerifyEmailProvider } from './providers/xverify-email.provider';
import {
  AddressVerificationInput,
  AddressVerificationResult,
  EmailVerificationResult,
  SsnVerificationResult,
} from './verification.types';

@Injectable()
export class VerificationService {
  constructor(
    private readonly xverifyEmailProvider: XVerifyEmailProvider,
    private readonly smartyAddressProvider: SmartyAddressProvider,
    private readonly vouchedSsnProvider: VouchedSsnProvider,
  ) {}

  verifyEmail(email: string): Promise<EmailVerificationResult> {
    return this.xverifyEmailProvider.verifyEmail(email);
  }

  verifySsnLast4(input: {
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
    ssn: string;
  }): Promise<SsnVerificationResult> {
    return this.vouchedSsnProvider.verifyLast4(input);
  }

  validateAddress(
    input: AddressVerificationInput,
  ): Promise<AddressVerificationResult> {
    return this.smartyAddressProvider.validateAddress(input);
  }
}
