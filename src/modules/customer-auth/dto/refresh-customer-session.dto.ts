import { IsOptional, IsString } from 'class-validator';

export class RefreshCustomerSessionDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
