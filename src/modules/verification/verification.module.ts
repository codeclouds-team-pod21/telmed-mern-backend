import { Module } from '@nestjs/common';
import { SmartyAddressProvider } from './providers/smarty-address.provider';
import { VouchedSsnProvider } from './providers/vouched-ssn.provider';
import { XVerifyEmailProvider } from './providers/xverify-email.provider';
import { VerificationService } from './verification.service';

@Module({
  providers: [
    VerificationService,
    XVerifyEmailProvider,
    SmartyAddressProvider,
    VouchedSsnProvider,
  ],
  exports: [VerificationService],
})
export class VerificationModule {}
