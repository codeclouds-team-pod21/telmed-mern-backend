import { IsString, Length } from 'class-validator';

export class UploadSsnDto {
  @IsString()
  @Length(4, 4)
  ssn!: string;
}
