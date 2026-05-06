import { Transform } from 'class-transformer';
import { IsEmail } from 'class-validator';

export class CustomerForgotPasswordDto {
  @IsEmail()
  @Transform(({ value }) => String(value ?? '').trim().toLowerCase())
  email!: string;
}
