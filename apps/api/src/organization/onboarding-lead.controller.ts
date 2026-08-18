import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  InvalidCaptchaError,
  OnboardingLeadNotFoundError,
  OnboardingLeadService,
  OrganizationAdministrationDeniedError,
} from '@zhixing/server-core';
import { CsrfGuard } from '../identity/csrf.guard';
import { SessionAuthGuard } from '../identity/session-auth.guard';
import {
  OnboardingLeadDto,
  SubmitOnboardingLeadDto,
  UpdateOnboardingLeadStatusDto,
} from './dto/onboarding-lead.dto';

@ApiTags('Onboarding leads')
@Controller('public/onboarding-leads')
export class PublicOnboardingLeadController {
  constructor(
    @Inject(OnboardingLeadService)
    private readonly leads: OnboardingLeadService,
  ) {}

  @Post()
  @ApiBody({ type: SubmitOnboardingLeadDto })
  @ApiCreatedResponse({ type: OnboardingLeadDto })
  async submit(
    @Body() input: SubmitOnboardingLeadDto,
  ): Promise<OnboardingLeadDto> {
    try {
      return await this.leads.submit(input);
    } catch (error) {
      throw mapLeadError(error);
    }
  }
}

@ApiTags('Onboarding leads')
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
@Controller('organizations/onboarding-leads')
export class OrganizationOnboardingLeadController {
  constructor(
    @Inject(OnboardingLeadService)
    private readonly leads: OnboardingLeadService,
  ) {}

  @Get()
  @ApiOkResponse({ type: OnboardingLeadDto, isArray: true })
  async list(): Promise<OnboardingLeadDto[]> {
    try {
      return await this.leads.list();
    } catch (error) {
      throw mapLeadError(error);
    }
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiHeader({ name: 'x-csrf-token', required: true })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: UpdateOnboardingLeadStatusDto })
  @ApiOkResponse({ type: OnboardingLeadDto })
  async updateStatus(
    @Param('id', new ParseUUIDPipe({ version: '4' }))
    id: string,
    @Body() input: UpdateOnboardingLeadStatusDto,
  ): Promise<OnboardingLeadDto> {
    try {
      return await this.leads.updateStatus(id, input.status);
    } catch (error) {
      throw mapLeadError(error);
    }
  }
}

function mapLeadError(error: unknown): Error {
  if (error instanceof OrganizationAdministrationDeniedError) {
    return new ForbiddenException(error.message);
  }
  if (error instanceof OnboardingLeadNotFoundError) {
    return new NotFoundException(error.message);
  }
  if (error instanceof InvalidCaptchaError) {
    return new UnprocessableEntityException(error.message);
  }
  return error instanceof Error ? error : new Error(String(error));
}
