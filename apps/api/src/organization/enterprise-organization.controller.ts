import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  EnterpriseOrganizationDeniedError,
  EnterpriseOrganizationNotFoundError,
  EnterpriseOrganizationService,
  OrganizationConflictError,
  OrganizationReferenceNotFoundError,
} from '@zhixing/server-core';
import { CsrfGuard } from '../identity/csrf.guard';
import { SessionAuthGuard } from '../identity/session-auth.guard';
import {
  CreateEnterpriseDepartmentDto,
  CreateEnterpriseMemberDto,
  EnterpriseDepartmentDto,
  EnterpriseMemberDto,
  EnterpriseOrgDto,
  ReplaceEnterpriseLocationsDto,
} from './dto/enterprise-organization.dto';

@ApiTags('Enterprise organization')
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
@Controller('enterprise')
export class EnterpriseOrganizationController {
  constructor(
    @Inject(EnterpriseOrganizationService)
    private readonly organization: EnterpriseOrganizationService,
  ) {}

  @Get('org')
  @ApiOkResponse({ type: EnterpriseOrgDto })
  async getOrg(): Promise<EnterpriseOrgDto> {
    try {
      return await this.organization.getOrg();
    } catch (error) {
      throw mapEnterpriseError(error);
    }
  }

  @Post('departments')
  @UseGuards(CsrfGuard)
  @ApiHeader({ name: 'x-csrf-token', required: true })
  @ApiBody({ type: CreateEnterpriseDepartmentDto })
  @ApiCreatedResponse({ type: EnterpriseDepartmentDto })
  async createDepartment(
    @Body() input: CreateEnterpriseDepartmentDto,
  ): Promise<EnterpriseDepartmentDto> {
    try {
      return await this.organization.createDepartment(input);
    } catch (error) {
      throw mapEnterpriseError(error);
    }
  }

  @Put('locations')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CsrfGuard)
  @ApiHeader({ name: 'x-csrf-token', required: true })
  @ApiBody({ type: ReplaceEnterpriseLocationsDto })
  @ApiNoContentResponse()
  async replaceLocations(
    @Body() input: ReplaceEnterpriseLocationsDto,
  ): Promise<void> {
    try {
      await this.organization.replaceLocations(input.locationCodes);
    } catch (error) {
      throw mapEnterpriseError(error);
    }
  }

  @Post('members')
  @UseGuards(CsrfGuard)
  @ApiHeader({ name: 'x-csrf-token', required: true })
  @ApiBody({ type: CreateEnterpriseMemberDto })
  @ApiCreatedResponse({ type: EnterpriseMemberDto })
  async createMember(
    @Body() input: CreateEnterpriseMemberDto,
  ): Promise<EnterpriseMemberDto> {
    try {
      return await this.organization.createMember(input);
    } catch (error) {
      throw mapEnterpriseError(error);
    }
  }

  @Post('members/:membershipId/disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CsrfGuard)
  @ApiHeader({ name: 'x-csrf-token', required: true })
  @ApiParam({ name: 'membershipId', format: 'uuid' })
  @ApiNoContentResponse()
  async disableMember(
    @Param('membershipId', new ParseUUIDPipe({ version: '4' }))
    membershipId: string,
  ): Promise<void> {
    try {
      await this.organization.disableMember(membershipId);
    } catch (error) {
      throw mapEnterpriseError(error);
    }
  }
}

function mapEnterpriseError(error: unknown): Error {
  if (error instanceof EnterpriseOrganizationDeniedError) {
    return new ForbiddenException(error.message);
  }
  if (error instanceof EnterpriseOrganizationNotFoundError) {
    return new NotFoundException(error.message);
  }
  if (error instanceof OrganizationConflictError) {
    return new ConflictException(error.message);
  }
  if (error instanceof OrganizationReferenceNotFoundError) {
    return new UnprocessableEntityException(error.message);
  }
  return error instanceof Error ? error : new Error(String(error));
}
