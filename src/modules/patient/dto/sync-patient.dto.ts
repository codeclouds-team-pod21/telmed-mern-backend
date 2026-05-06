import { Type } from 'class-transformer';
import { IsInt, IsOptional } from 'class-validator';

export class SyncPatientDto {
  @Type(() => Number)
  @IsInt()
  customerId!: number;

  @Type(() => Number)
  @IsInt()
  productVariantId!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  funnelProductId?: number;
}
