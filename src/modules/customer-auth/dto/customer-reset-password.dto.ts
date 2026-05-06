import { IsString, MinLength } from 'class-validator';

export class CustomerResetPasswordDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
