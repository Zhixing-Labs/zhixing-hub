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
  ApiNoContentResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  GovernmentOrganizationDeniedError,
  GovernmentOrganizationNotFoundError,
  GovernmentOrganizationService,
  OrganizationConflictError,
  OrganizationReferenceNotFoundError,
  PublicAcademyAdminService,
  PublicAcademyCampusOccupiedError,
  PublicAcademyDeniedError,
  PublicAcademyNotFoundError,
} from '@zhixing/server-core';
import { CsrfGuard } from '../identity/csrf.guard';
import { SessionAuthGuard } from '../identity/session-auth.guard';
import {
  CreateGovernmentMemberDto,
  GovernmentMemberDto,
  PublicAcademyCampusDto,
  SetPublicAcademyCampusStatusDto,
} from './dto/government-and-public-academy.dto';

@ApiTags('Government organization')
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
@Controller('government')
export class GovernmentOrganizationController {
  constructor(
    @Inject(GovernmentOrganizationService)
    private readonly organization: GovernmentOrganizationService,
  ) {}

  @Get('members')
  @ApiOkResponse({ type: GovernmentMemberDto, isArray: true })
  async listMembers(): Promise<GovernmentMemberDto[]> {
    try {
      return await this.organization.listMembers();
    } catch (error) {
      throw mapGovernmentError(error);
    }
  }

  @Post('members')
  @UseGuards(CsrfGuard)
  @ApiHeader({ name: 'x-csrf-token', required: true })
  @ApiBody({ type: CreateGovernmentMemberDto })
  @ApiCreatedResponse({ type: GovernmentMemberDto })
  async createMember(
    @Body() input: CreateGovernmentMemberDto,
  ): Promise<GovernmentMemberDto> {
    try {
      return await this.organization.createMember(input);
    } catch (error) {
      throw mapGovernmentError(error);
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
      throw mapGovernmentError(error);
    }
  }
}

@ApiTags('Public academy')
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
@Controller('platform/public-academy/campuses')
export class PublicAcademyController {
  constructor(
    @Inject(PublicAcademyAdminService)
    private readonly academy: PublicAcademyAdminService,
  ) {}

  @Get()
  @ApiOkResponse({ type: PublicAcademyCampusDto, isArray: true })
  async listCampuses(): Promise<PublicAcademyCampusDto[]> {
    try {
      return await this.academy.listCampuses();
    } catch (error) {
      throw mapPublicAcademyError(error);
    }
  }

  @Patch(':campusId')
  @UseGuards(CsrfGuard)
  @ApiHeader({ name: 'x-csrf-token', required: true })
  @ApiParam({ name: 'campusId', format: 'uuid' })
  @ApiBody({ type: SetPublicAcademyCampusStatusDto })
  @ApiOkResponse({ type: PublicAcademyCampusDto })
  async setCampusStatus(
    @Param('campusId', new ParseUUIDPipe({ version: '4' }))
    campusId: string,
    @Body() input: SetPublicAcademyCampusStatusDto,
  ): Promise<PublicAcademyCampusDto> {
    try {
      return await this.academy.setCampusStatus(campusId, input.status);
    } catch (error) {
      throw mapPublicAcademyError(error);
    }
  }
}

function mapGovernmentError(error: unknown): Error {
  if (error instanceof GovernmentOrganizationDeniedError) {
    return new ForbiddenException(error.message);
  }
  if (error instanceof GovernmentOrganizationNotFoundError) {
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

function mapPublicAcademyError(error: unknown): Error {
  if (error instanceof PublicAcademyDeniedError) {
    return new ForbiddenException(error.message);
  }
  if (error instanceof PublicAcademyNotFoundError) {
    return new NotFoundException(error.message);
  }
  if (error instanceof PublicAcademyCampusOccupiedError) {
    return new ConflictException(error.message);
  }
  return error instanceof Error ? error : new Error(String(error));
}
