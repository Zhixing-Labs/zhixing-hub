import {
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
  Body,
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
  InvalidStudentLifecycleTransitionError,
  StudentAdminDeniedError,
  StudentAdminNotFoundError,
  StudentAdminService,
  StudentDeregisterNotAllowedError,
  StudentIdentityCorrectionEmptyError,
  StudentPhoneConflictError,
  StudentNumberConflictError,
} from '@zhixing/server-core';
import { CsrfGuard } from '../identity/csrf.guard';
import { SessionAuthGuard } from '../identity/session-auth.guard';
import {
  CorrectStudentIdentityDto,
  CreateClassStudentDto,
  GraduateClassStudentsDto,
  StudentSummaryDto,
} from './dto/university-student.dto';

@ApiTags('University students')
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
@Controller('university')
export class UniversityStudentController {
  constructor(
    @Inject(StudentAdminService)
    private readonly students: StudentAdminService,
  ) {}

  @Get('classes/:classId/students')
  @ApiParam({ name: 'classId', format: 'uuid' })
  @ApiOkResponse({ type: StudentSummaryDto, isArray: true })
  async listClassStudents(
    @Param('classId', new ParseUUIDPipe({ version: '4' }))
    classId: string,
  ): Promise<StudentSummaryDto[]> {
    try {
      return await this.students.listClassStudents(classId);
    } catch (error) {
      throw mapStudentAdminError(error);
    }
  }

  @Post('classes/:classId/students')
  @UseGuards(CsrfGuard)
  @ApiHeader({ name: 'x-csrf-token', required: true })
  @ApiParam({ name: 'classId', format: 'uuid' })
  @ApiBody({ type: CreateClassStudentDto })
  @ApiCreatedResponse({ type: StudentSummaryDto })
  async createStudent(
    @Param('classId', new ParseUUIDPipe({ version: '4' }))
    classId: string,
    @Body() input: CreateClassStudentDto,
  ): Promise<StudentSummaryDto> {
    try {
      return await this.students.createStudent(classId, input);
    } catch (error) {
      throw mapStudentAdminError(error);
    }
  }

  @Post('classes/:classId/students/graduate')
  @UseGuards(CsrfGuard)
  @ApiHeader({ name: 'x-csrf-token', required: true })
  @ApiParam({ name: 'classId', format: 'uuid' })
  @ApiBody({ type: GraduateClassStudentsDto })
  @ApiOkResponse({ type: StudentSummaryDto, isArray: true })
  async graduateStudents(
    @Param('classId', new ParseUUIDPipe({ version: '4' }))
    classId: string,
    @Body() input: GraduateClassStudentsDto,
  ): Promise<StudentSummaryDto[]> {
    try {
      return await this.students.graduateStudents(classId, input);
    } catch (error) {
      throw mapStudentAdminError(error);
    }
  }

  @Post('students/:accountId/suspend')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CsrfGuard)
  @ApiHeader({ name: 'x-csrf-token', required: true })
  @ApiParam({ name: 'accountId', format: 'uuid' })
  @ApiNoContentResponse()
  async suspendStudent(
    @Param('accountId', new ParseUUIDPipe({ version: '4' }))
    accountId: string,
  ): Promise<void> {
    try {
      await this.students.suspendStudent(accountId);
    } catch (error) {
      throw mapStudentAdminError(error);
    }
  }

  @Post('students/:accountId/restore')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CsrfGuard)
  @ApiHeader({ name: 'x-csrf-token', required: true })
  @ApiParam({ name: 'accountId', format: 'uuid' })
  @ApiNoContentResponse()
  async restoreStudent(
    @Param('accountId', new ParseUUIDPipe({ version: '4' }))
    accountId: string,
  ): Promise<void> {
    try {
      await this.students.restoreStudent(accountId);
    } catch (error) {
      throw mapStudentAdminError(error);
    }
  }

  @Post('students/:accountId/deregister')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CsrfGuard)
  @ApiHeader({ name: 'x-csrf-token', required: true })
  @ApiParam({ name: 'accountId', format: 'uuid' })
  @ApiNoContentResponse()
  async deregisterStudent(
    @Param('accountId', new ParseUUIDPipe({ version: '4' }))
    accountId: string,
  ): Promise<void> {
    try {
      await this.students.deregisterStudent(accountId);
    } catch (error) {
      throw mapStudentAdminError(error);
    }
  }

  @Patch('students/:accountId/identity')
  @UseGuards(CsrfGuard)
  @ApiHeader({ name: 'x-csrf-token', required: true })
  @ApiParam({ name: 'accountId', format: 'uuid' })
  @ApiBody({ type: CorrectStudentIdentityDto })
  @ApiOkResponse({ type: StudentSummaryDto })
  async correctStudentIdentity(
    @Param('accountId', new ParseUUIDPipe({ version: '4' }))
    accountId: string,
    @Body() input: CorrectStudentIdentityDto,
  ): Promise<StudentSummaryDto> {
    try {
      return await this.students.correctStudentIdentity(accountId, input);
    } catch (error) {
      throw mapStudentAdminError(error);
    }
  }
}

function mapStudentAdminError(error: unknown): Error {
  if (error instanceof StudentAdminDeniedError) {
    return new ForbiddenException(error.message);
  }
  if (error instanceof StudentAdminNotFoundError) {
    return new NotFoundException(error.message);
  }
  if (error instanceof StudentPhoneConflictError) {
    return new ConflictException(
      `${error.occupation.subjectType}: ${error.occupation.guidance}`,
    );
  }
  if (error instanceof StudentNumberConflictError) {
    return new ConflictException(error.message);
  }
  if (error instanceof InvalidStudentLifecycleTransitionError) {
    return new ConflictException(error.message);
  }
  if (error instanceof StudentDeregisterNotAllowedError) {
    return new ConflictException(error.message);
  }
  if (error instanceof StudentIdentityCorrectionEmptyError) {
    return new UnprocessableEntityException(error.message);
  }
  return error instanceof Error ? error : new Error(String(error));
}
