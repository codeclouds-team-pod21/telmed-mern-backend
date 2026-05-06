import { IsOptional, IsString } from 'class-validator';

export class RefreshAdminSessionDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
