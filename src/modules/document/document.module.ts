import { Module } from '@nestjs/common';
import { DocumentController } from './document.controller';
import { DocumentService } from './document.service';
import { DoctorNetworkModule } from '../doctor-network/doctor-network.module';
import { PatientModule } from '../patient/patient.module';

@Module({
  imports: [DoctorNetworkModule, PatientModule],
  controllers: [DocumentController],
  providers: [DocumentService],
  exports: [DocumentService],
})
export class DocumentModule {}
