import { IsObject } from 'class-validator';

export class ValidateCouponDto {
  @IsObject()
  body!: Record<string, unknown>;

  @IsObject()
  mapping!: Record<string, unknown>;
}
