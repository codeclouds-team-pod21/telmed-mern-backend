import { Module } from '@nestjs/common';
import { DocumentController } from './document.controller';
import { DocumentService } from './document.service';
import { DoctorNetworkModule } from '../doctor-network/doctor-network.module';
import { PatientModule } from '../patient/patient.module';
import { VerificationModule } from '../verification/verification.module';

@Module({
  imports: [DoctorNetworkModule, PatientModule, VerificationModule],
  controllers: [DocumentController],
  providers: [DocumentService],
  exports: [DocumentService],
})
export class DocumentModule {}
