import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { ChangeAdminPasswordDto } from './dto/change-admin-password.dto';
import { UpdateAdminProfileDto } from './dto/update-admin-profile.dto';

@Injectable()
export class AdminProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: number) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        updatedAt: true,
        lastLoggedIn: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Admin profile not found.');
    }

    return {
      ...user,
      initials: this.getInitials(user.name),
    };
  }

  async updateProfile(userId: number, dto: UpdateAdminProfileDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: dto.name.trim(),
      },
      select: {
        id: true,
        name: true,
        email: true,
        updatedAt: true,
        lastLoggedIn: true,
      },
    });

    return {
      ...user,
      initials: this.getInitials(user.name),
    };
  }

  async changePassword(userId: number, dto: ChangeAdminPasswordDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
      },
      select: {
        id: true,
        password: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Admin profile not found.');
    }

    const currentMatches = await compare(dto.currentPassword, user.password);

    if (!currentMatches) {
      throw new BadRequestException('Current password is incorrect.');
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('New password must be different from the current password.');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: await hash(dto.newPassword, 10),
        twoFactorCode: null,
        twoFactorExpiresAt: null,
      },
      select: {
        updatedAt: true,
      },
    });

    return {
      success: true,
      changedAt: new Date().toISOString(),
    };
  }

  private getInitials(name: string) {
    return name
      .split(' ')
      .map((part) => part.trim())
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'AD';
  }
}
