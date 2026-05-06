import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { PatientService } from './patient.service';
import { SyncPatientDto } from './dto/sync-patient.dto';

@Controller('patients')
export class PatientController {
  constructor(private readonly patientService: PatientService) {}

  @Post('sync')
  syncPatient(@Body() dto: SyncPatientDto) {
    return this.patientService.syncPatient(dto);
  }

  @Post('sync-video')
  updatePatientWithVideo(@Body() dto: SyncPatientDto) {
    return this.patientService.updatePatientWithVideo(dto);
  }

  @Get('customer/:customerId')
  findByCustomer(@Param('customerId', ParseIntPipe) customerId: number) {
    return this.patientService.findByCustomer(customerId);
  }
}
