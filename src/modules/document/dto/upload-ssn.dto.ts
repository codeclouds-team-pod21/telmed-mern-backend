import { Type } from 'class-transformer';
import { IsInt, IsString, Length, Matches } from 'class-validator';

export class UploadSsnDto {
  @Type(() => Number)
  @IsInt()
  productVariantId!: number;

  @IsString()
  @Length(4, 4)
  @Matches(/^\d{4}$/, { message: 'ssn must be exactly 4 digits' })
  ssn!: string;
}
