import { Module } from '@nestjs/common';
import { SmartyAddressProvider } from './providers/smarty-address.provider';
import { XVerifyEmailProvider } from './providers/xverify-email.provider';
import { VerificationService } from './verification.service';

@Module({
  providers: [VerificationService, XVerifyEmailProvider, SmartyAddressProvider],
  exports: [VerificationService],
})
export class VerificationModule {}
