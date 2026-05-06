import { Body, Controller, Delete, Get, Param, ParseEnumPipe, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminPermissions } from '../admin-auth/decorators/admin-permissions.decorator';
import { CurrentAdmin } from '../admin-auth/decorators/current-admin.decorator';
import { AdminAuthGuard } from '../admin-auth/guards/admin-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import type { AdminAuthUser } from '../admin-auth/admin-auth.types';
import { CloneQuestionnaireDto } from './dto/clone-questionnaire.dto';
import { CreateQuestionnaireDto } from './dto/create-questionnaire.dto';
import { EvaluateQuestionnaireDto } from './dto/evaluate-questionnaire.dto';
import { SaveQuestionnaireDto } from './dto/save-questionnaire.dto';
import { QuestionnaireService } from './questionnaire.service';
import { QuestionnaireType } from './questionnaire-type.enum';

@Controller('questionnaires')
export class QuestionnaireController {
  constructor(private readonly questionnaireService: QuestionnaireService) {}

  @Get()
  @UseGuards(AdminAuthGuard, AdminPermissionGuard)
  @AdminPermissions('forms.admin.list')
  listQuestionnaires(
    @Query('type') type?: string,
    @Query('searchText') searchText?: string,
    @Query('engineType') engineType?: string,
    @Query('status') status?: string,
  ) {
    return this.questionnaireService.listQuestionnaires({
      type,
      searchText,
      engineType,
      status: status === undefined ? undefined : status === 'true',
    });
  }

  @Get('types')
  @UseGuards(AdminAuthGuard, AdminPermissionGuard)
  @AdminPermissions('forms.admin.add', 'forms.admin.modify')
  getTypes() {
    return this.questionnaireService.getTypes();
  }

  @Get('admin/:id')
  @UseGuards(AdminAuthGuard, AdminPermissionGuard)
  @AdminPermissions('forms.admin.view', 'forms.admin.modify')
  getAdminQuestionnaire(@Param('id', ParseIntPipe) id: number) {
    return this.questionnaireService.getQuestionnaire(id);
  }

  @Get(':id')
  @UseGuards(AdminAuthGuard, AdminPermissionGuard)
  @AdminPermissions('forms.admin.view', 'forms.admin.modify')
  getQuestionnaire(@Param('id', ParseIntPipe) id: number) {
    return this.questionnaireService.getQuestionnaire(id);
  }

  @Get('funnel-product/:funnelProductId/:type')
  getProductQuestionnaire(
    @Param('funnelProductId', ParseIntPipe) funnelProductId: number,
    @Param('type', new ParseEnumPipe(QuestionnaireType)) type: QuestionnaireType,
  ) {
    return this.questionnaireService.getProductQuestionnaire(funnelProductId, type);
  }

  @Post('customer/:customerId/answers')
  saveAnswers(
    @Param('customerId', ParseIntPipe) customerId: number,
    @Body() dto: SaveQuestionnaireDto,
  ) {
    return this.questionnaireService.saveAnswers(customerId, dto);
  }

  @Post('evaluate')
  evaluateAnswers(@Body() dto: EvaluateQuestionnaireDto) {
    return this.questionnaireService.evaluateAnswers(dto);
  }

  @Post()
  @UseGuards(AdminAuthGuard, AdminPermissionGuard)
  @AdminPermissions('forms.admin.add')
  create(
    @Body() dto: CreateQuestionnaireDto,
    @CurrentAdmin() admin?: AdminAuthUser,
  ) {
    return this.questionnaireService.create(dto, admin?.id);
  }

  @Patch(':id')
  @UseGuards(AdminAuthGuard, AdminPermissionGuard)
  @AdminPermissions('forms.admin.modify')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateQuestionnaireDto,
    @CurrentAdmin() admin?: AdminAuthUser,
  ) {
    return this.questionnaireService.update(id, dto, admin?.id);
  }

  @Post('admin/:id/clone')
  @UseGuards(AdminAuthGuard, AdminPermissionGuard)
  @AdminPermissions('forms.admin.add')
  clone(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CloneQuestionnaireDto,
    @CurrentAdmin() admin?: AdminAuthUser,
  ) {
    return this.questionnaireService.clone(id, dto.name, admin?.id);
  }

  @Delete('admin/:id')
  @UseGuards(AdminAuthGuard, AdminPermissionGuard)
  @AdminPermissions('forms.admin.delete')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentAdmin() admin?: AdminAuthUser,
  ) {
    return this.questionnaireService.remove(id, admin?.id);
  }
}
