import { IsInt, IsOptional } from 'class-validator';

export class CreateSwapOrderDto {
  @IsInt()
  productVariantId!: number;

  @IsInt()
  planId!: number;

  @IsOptional()
  @IsInt()
  questionnaireId?: number;
}
