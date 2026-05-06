import { Module } from '@nestjs/common';
import { DoctorNetworkController } from './doctor-network.controller';
import { DoctorNetworkService } from './doctor-network.service';
import { MdiProvider } from './providers/mdi.provider';

@Module({
  controllers: [DoctorNetworkController],
  providers: [DoctorNetworkService, MdiProvider],
  exports: [DoctorNetworkService, MdiProvider],
})
export class DoctorNetworkModule {}
