import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class ManageProductDatasetDto {
  @IsString()
  @IsNotEmpty()
  label!: string;

  @IsString()
  @IsIn(['product_category', 'product_type'])
  type!: 'product_category' | 'product_type';
}
