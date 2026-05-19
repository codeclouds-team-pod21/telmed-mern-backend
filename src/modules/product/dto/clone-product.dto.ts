import { IsNotEmpty, IsString } from 'class-validator';

export class CloneProductDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
}
