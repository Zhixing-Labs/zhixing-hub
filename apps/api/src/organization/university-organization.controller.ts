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
  OrganizationConflictError,
  OrganizationReferenceNotFoundError,
  UniversityOrganizationDeniedError,
  UniversityOrganizationNotFoundError,
  UniversityOrganizationService,
} from '@zhixing/server-core';
import { CsrfGuard } from '../identity/csrf.guard';
import { SessionAuthGuard } from '../identity/session-auth.guard';
import {
  AssignClassCounselorDto,
  CampusDto,
  ClassSummaryDto,
  CollegeSummaryDto,
  CreateCampusDto,
  CreateClassDto,
  CreateCollegeDto,
  CreateMajorDto,
  CreateUniversityMemberDto,
  MajorSummaryDto,
  ReplaceCollegeCampusesDto,
  UniversityMemberDto,
  UniversityOrgTreeDto,
} from './dto/university-organization.dto';

@ApiTags('University organization')
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
@Controller('university')
export class UniversityOrganizationController {
  constructor(
    @Inject(UniversityOrganizationService)
    private readonly organization: UniversityOrganizationService,
  ) {}

  @Get('org-tree')
  @ApiOkResponse({ type: UniversityOrgTreeDto })
  async orgTree(): Promise<UniversityOrgTreeDto> {
    try {
      return await this.organization.getOrgTree();
    } catch (error) {
      throw mapUniversityOrganizationError(error);
    }
  }

  @Post('campuses')
  @UseGuards(CsrfGuard)
  @ApiHeader({ name: 'x-csrf-token', required: true })
  @ApiBody({ type: CreateCampusDto })
  @ApiCreatedResponse({ type: CampusDto })
  async createCampus(@Body() input: CreateCampusDto): Promise<CampusDto> {
    try {
      return await this.organization.createCampus(input);
    } catch (error) {
      throw mapUniversityOrganizationError(error);
    }
  }

  @Post('colleges')
  @UseGuards(CsrfGuard)
  @ApiHeader({ name: 'x-csrf-token', required: true })
  @ApiBody({ type: CreateCollegeDto })
  @ApiCreatedResponse({ type: CollegeSummaryDto })
  async createCollege(
    @Body() input: CreateCollegeDto,
  ): Promise<CollegeSummaryDto> {
    try {
      return await this.organization.createCollege(input);
    } catch (error) {
      throw mapUniversityOrganizationError(error);
    }
  }

  @Put('colleges/:collegeId/campuses')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CsrfGuard)
  @ApiHeader({ name: 'x-csrf-token', required: true })
  @ApiParam({ name: 'collegeId', format: 'uuid' })
  @ApiBody({ type: ReplaceCollegeCampusesDto })
  @ApiNoContentResponse()
  async replaceCollegeCampuses(
    @Param('collegeId', new ParseUUIDPipe({ version: '4' }))
    collegeId: string,
    @Body() input: ReplaceCollegeCampusesDto,
  ): Promise<void> {
    try {
      await this.organization.replaceCollegeCampuses(collegeId, input);
    } catch (error) {
      throw mapUniversityOrganizationError(error);
    }
  }

  @Post('majors')
  @UseGuards(CsrfGuard)
  @ApiHeader({ name: 'x-csrf-token', required: true })
  @ApiBody({ type: CreateMajorDto })
  @ApiCreatedResponse({ type: MajorSummaryDto })
  async createMajor(@Body() input: CreateMajorDto): Promise<MajorSummaryDto> {
    try {
      return await this.organization.createMajor(input);
    } catch (error) {
      throw mapUniversityOrganizationError(error);
    }
  }

  @Post('classes')
  @UseGuards(CsrfGuard)
  @ApiHeader({ name: 'x-csrf-token', required: true })
  @ApiBody({ type: CreateClassDto })
  @ApiCreatedResponse({ type: ClassSummaryDto })
  async createClass(@Body() input: CreateClassDto): Promise<ClassSummaryDto> {
    try {
      return await this.organization.createClass(input);
    } catch (error) {
      throw mapUniversityOrganizationError(error);
    }
  }

  @Patch('classes/:classId/counselor')
  @UseGuards(CsrfGuard)
  @ApiHeader({ name: 'x-csrf-token', required: true })
  @ApiParam({ name: 'classId', format: 'uuid' })
  @ApiBody({ type: AssignClassCounselorDto })
  @ApiOkResponse({ type: ClassSummaryDto })
  async assignClassCounselor(
    @Param('classId', new ParseUUIDPipe({ version: '4' }))
    classId: string,
    @Body() input: AssignClassCounselorDto,
  ): Promise<ClassSummaryDto> {
    try {
      return await this.organization.assignClassCounselor(classId, input);
    } catch (error) {
      throw mapUniversityOrganizationError(error);
    }
  }

  @Post('members')
  @UseGuards(CsrfGuard)
  @ApiHeader({ name: 'x-csrf-token', required: true })
  @ApiBody({ type: CreateUniversityMemberDto })
  @ApiCreatedResponse({ type: UniversityMemberDto })
  async createMember(
    @Body() input: CreateUniversityMemberDto,
  ): Promise<UniversityMemberDto> {
    try {
      return await this.organization.createMember(input);
    } catch (error) {
      throw mapUniversityOrganizationError(error);
    }
  }
}

function mapUniversityOrganizationError(error: unknown): Error {
  if (error instanceof UniversityOrganizationDeniedError) {
    return new ForbiddenException(error.message);
  }
  if (error instanceof UniversityOrganizationNotFoundError) {
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
