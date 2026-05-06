import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateUserSettingsRecordDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsInt()
  roleId!: number;

  @IsEnum(['Active', 'Inactive'])
  status!: 'Active' | 'Inactive';

  @IsBoolean()
  twoFactorEnabled!: boolean;
}

export class UpdateUserSettingsRecordDto {
  @IsInt()
  id!: number;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsInt()
  roleId!: number;

  @IsEnum(['Active', 'Inactive'])
  status!: 'Active' | 'Inactive';

  @IsBoolean()
  twoFactorEnabled!: boolean;
}

export class CreateUserSettingsMutationDto {
  @IsEnum(['create'])
  action!: 'create';

  @ValidateNested()
  @Type(() => CreateUserSettingsRecordDto)
  record!: CreateUserSettingsRecordDto;
}

export class UpdateUserSettingsMutationDto {
  @IsEnum(['update'])
  action!: 'update';

  @ValidateNested()
  @Type(() => UpdateUserSettingsRecordDto)
  record!: UpdateUserSettingsRecordDto;
}

export class DeleteUserSettingsMutationDto {
  @IsEnum(['delete'])
  action!: 'delete';

  @IsInt()
  id!: number;
}

export class CreateRoleSettingsRecordDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsInt({ each: true })
  @ArrayUnique()
  permissionIds!: number[];
}

export class CreateRoleSettingsMutationDto {
  @IsEnum(['create-role'])
  action!: 'create-role';

  @ValidateNested()
  @Type(() => CreateRoleSettingsRecordDto)
  record!: CreateRoleSettingsRecordDto;
}

export type UserSettingsMutationDto =
  | CreateUserSettingsMutationDto
  | UpdateUserSettingsMutationDto
  | DeleteUserSettingsMutationDto
  | CreateRoleSettingsMutationDto;
