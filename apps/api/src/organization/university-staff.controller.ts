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
  ClassTransferConflictError,
  ClassTransferDeniedError,
  ClassTransferInvalidError,
  ClassTransferNotFoundError,
  ClassTransferService,
  OrganizationReferenceNotFoundError,
  StaffHandoverRequiredError,
  UniversityOrganizationDeniedError,
  UniversityOrganizationNotFoundError,
  UniversityStaffService,
} from '@zhixing/server-core';
import { CsrfGuard } from '../identity/csrf.guard';
import { SessionAuthGuard } from '../identity/session-auth.guard';
import {
  ClassTransferRequestDto,
  CreateClassTransferDto,
  HandoverUniversityMemberDto,
  ResolveClassTransferDto,
  StaffHandoverResultDto,
} from './dto/staff-and-class-transfer.dto';

@ApiTags('University staff')
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
@Controller('university')
export class UniversityStaffController {
  constructor(
    @Inject(UniversityStaffService)
    private readonly staff: UniversityStaffService,
    @Inject(ClassTransferService)
    private readonly classTransfers: ClassTransferService,
  ) {}

  @Post('members/:membershipId/handover')
  @UseGuards(CsrfGuard)
  @ApiHeader({ name: 'x-csrf-token', required: true })
  @ApiParam({ name: 'membershipId', format: 'uuid' })
  @ApiBody({ type: HandoverUniversityMemberDto })
  @ApiOkResponse({ type: StaffHandoverResultDto })
  async handover(
    @Param('membershipId', new ParseUUIDPipe({ version: '4' }))
    membershipId: string,
    @Body() input: HandoverUniversityMemberDto,
  ): Promise<StaffHandoverResultDto> {
    try {
      return await this.staff.handover(membershipId, input);
    } catch (error) {
      throw mapStaffError(error);
    }
  }

  @Post('members/:membershipId/disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CsrfGuard)
  @ApiHeader({ name: 'x-csrf-token', required: true })
  @ApiParam({ name: 'membershipId', format: 'uuid' })
  @ApiNoContentResponse()
  async disable(
    @Param('membershipId', new ParseUUIDPipe({ version: '4' }))
    membershipId: string,
  ): Promise<void> {
    try {
      await this.staff.disable(membershipId);
    } catch (error) {
      throw mapStaffError(error);
    }
  }

  @Get('class-transfers')
  @ApiOkResponse({ type: ClassTransferRequestDto, isArray: true })
  async listPendingClassTransfers(): Promise<ClassTransferRequestDto[]> {
    try {
      return await this.classTransfers.listPendingForCounselor();
    } catch (error) {
      throw mapStaffError(error);
    }
  }

  @Post('class-transfers/:id/resolve')
  @UseGuards(CsrfGuard)
  @ApiHeader({ name: 'x-csrf-token', required: true })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: ResolveClassTransferDto })
  @ApiOkResponse({ type: ClassTransferRequestDto })
  async resolveClassTransfer(
    @Param('id', new ParseUUIDPipe({ version: '4' }))
    id: string,
    @Body() input: ResolveClassTransferDto,
  ): Promise<ClassTransferRequestDto> {
    try {
      return await this.classTransfers.resolve(id, input);
    } catch (error) {
      throw mapStaffError(error);
    }
  }
}

@ApiTags('Class transfer')
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
@Controller('account/me/class-transfers')
export class StudentClassTransferController {
  constructor(
    @Inject(ClassTransferService)
    private readonly classTransfers: ClassTransferService,
  ) {}

  @Get()
  @ApiOkResponse({ type: ClassTransferRequestDto, isArray: true })
  async listMine(): Promise<ClassTransferRequestDto[]> {
    try {
      return await this.classTransfers.listMine();
    } catch (error) {
      throw mapStaffError(error);
    }
  }

  @Post()
  @UseGuards(CsrfGuard)
  @ApiHeader({ name: 'x-csrf-token', required: true })
  @ApiBody({ type: CreateClassTransferDto })
  @ApiCreatedResponse({ type: ClassTransferRequestDto })
  async create(
    @Body() input: CreateClassTransferDto,
  ): Promise<ClassTransferRequestDto> {
    try {
      return await this.classTransfers.create(input);
    } catch (error) {
      throw mapStaffError(error);
    }
  }
}

function mapStaffError(error: unknown): Error {
  if (
    error instanceof UniversityOrganizationDeniedError ||
    error instanceof ClassTransferDeniedError
  ) {
    return new ForbiddenException(error.message);
  }
  if (
    error instanceof UniversityOrganizationNotFoundError ||
    error instanceof ClassTransferNotFoundError
  ) {
    return new NotFoundException(error.message);
  }
  if (
    error instanceof StaffHandoverRequiredError ||
    error instanceof ClassTransferConflictError
  ) {
    return new ConflictException(error.message);
  }
  if (
    error instanceof OrganizationReferenceNotFoundError ||
    error instanceof ClassTransferInvalidError
  ) {
    return new UnprocessableEntityException(error.message);
  }
  return error instanceof Error ? error : new Error(String(error));
}
