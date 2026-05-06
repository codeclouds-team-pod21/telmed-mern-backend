import { Module } from '@nestjs/common';
import { AdminProfileController } from './admin-profile.controller';
import { AdminProfileService } from './admin-profile.service';

@Module({
  controllers: [AdminProfileController],
  providers: [AdminProfileService],
  exports: [AdminProfileService],
})
export class AdminProfileModule {}
