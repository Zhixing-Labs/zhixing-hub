import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
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
  OrganizationAdminService,
  OrganizationAdministrationDeniedError,
  OrganizationConflictError,
  OrganizationQueryService,
  OrganizationReferenceNotFoundError,
} from '@zhixing/server-core';
import { CsrfGuard } from '../identity/csrf.guard';
import { SessionAuthGuard } from '../identity/session-auth.guard';
import {
  CreatedTenantDto,
  CreateEnterpriseDto,
  CreateGovernmentDto,
  CreateUniversityDto,
  InitialTenantAdminDto,
} from './dto/create-tenant.dto';
import { CurrentOrganizationDto } from './dto/current-organization.dto';
import {
  AdministrativeDivisionDto,
  CreatedUniversityAdminDto,
} from './dto/university-organization.dto';

@ApiTags('Organization')
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
@Controller('organizations')
export class OrganizationController {
  constructor(
    @Inject(OrganizationQueryService)
    private readonly organizations: OrganizationQueryService,
    @Inject(OrganizationAdminService)
    private readonly administration: OrganizationAdminService,
  ) {}

  @Get('administrative-divisions')
  @ApiOkResponse({ type: AdministrativeDivisionDto, isArray: true })
  async administrativeDivisions(): Promise<AdministrativeDivisionDto[]> {
    return this.organizations.listAdministrativeDivisions();
  }

  @Get('current')
  @ApiOkResponse({ type: CurrentOrganizationDto })
  async current(): Promise<CurrentOrganizationDto> {
    const organization = await this.organizations.getCurrentOrganization();
    if (!organization) {
      throw new NotFoundException('Current organization no longer exists');
    }
    return organization;
  }

  @Post('universities')
  @UseGuards(CsrfGuard)
  @ApiHeader({ name: 'x-csrf-token', required: true })
  @ApiBody({ type: CreateUniversityDto })
  @ApiCreatedResponse({ type: CreatedTenantDto })
  async createUniversity(
    @Body() input: CreateUniversityDto,
  ): Promise<CreatedTenantDto> {
    try {
      return await this.administration.createUniversity(input);
    } catch (error) {
      throw mapAdministrationError(error);
    }
  }

  @Post('universities/:tenantId/admins')
  @UseGuards(CsrfGuard)
  @ApiHeader({ name: 'x-csrf-token', required: true })
  @ApiParam({ name: 'tenantId', format: 'uuid' })
  @ApiBody({ type: InitialTenantAdminDto })
  @ApiCreatedResponse({ type: CreatedUniversityAdminDto })
  async addUniversityAdmin(
    @Param('tenantId', new ParseUUIDPipe({ version: '4' }))
    tenantId: string,
    @Body() input: InitialTenantAdminDto,
  ): Promise<CreatedUniversityAdminDto> {
    try {
      return await this.administration.addUniversityAdmin(tenantId, input);
    } catch (error) {
      throw mapAdministrationError(error);
    }
  }

  @Post('enterprises')
  @UseGuards(CsrfGuard)
  @ApiHeader({ name: 'x-csrf-token', required: true })
  @ApiBody({ type: CreateEnterpriseDto })
  @ApiCreatedResponse({ type: CreatedTenantDto })
  async createEnterprise(
    @Body() input: CreateEnterpriseDto,
  ): Promise<CreatedTenantDto> {
    try {
      return await this.administration.createEnterprise(input);
    } catch (error) {
      throw mapAdministrationError(error);
    }
  }

  @Post('governments')
  @UseGuards(CsrfGuard)
  @ApiHeader({ name: 'x-csrf-token', required: true })
  @ApiBody({ type: CreateGovernmentDto })
  @ApiCreatedResponse({ type: CreatedTenantDto })
  async createGovernment(
    @Body() input: CreateGovernmentDto,
  ): Promise<CreatedTenantDto> {
    try {
      return await this.administration.createGovernment(input);
    } catch (error) {
      throw mapAdministrationError(error);
    }
  }
}

function mapAdministrationError(error: unknown): Error {
  if (error instanceof OrganizationAdministrationDeniedError) {
    return new ForbiddenException(error.message);
  }
  if (error instanceof OrganizationConflictError) {
    return new ConflictException(error.message);
  }
  if (error instanceof OrganizationReferenceNotFoundError) {
    return new UnprocessableEntityException(error.message);
  }
  return error instanceof Error ? error : new Error(String(error));
}
