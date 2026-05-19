import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';

export class CloneFunnelDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsBoolean()
  status!: boolean;
}
