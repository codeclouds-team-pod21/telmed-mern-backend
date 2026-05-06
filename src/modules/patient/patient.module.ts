import { Module } from '@nestjs/common';
import { PatientController } from './patient.controller';
import { PatientService } from './patient.service';
import { DoctorNetworkModule } from '../doctor-network/doctor-network.module';

@Module({
  imports: [DoctorNetworkModule],
  controllers: [PatientController],
  providers: [PatientService],
  exports: [PatientService],
})
export class PatientModule {}
