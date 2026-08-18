import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  PayloadTooLargeException,
  Post,
  ConflictException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  CounselorStudentImportService,
  OrganizationConflictError,
  StudentCsvHeaderError,
  StudentCsvSizeError,
  StudentImportClassNotFoundError,
  StudentImportDeniedError,
} from '@zhixing/server-core';
import { CsrfGuard } from '../identity/csrf.guard';
import { SessionAuthGuard } from '../identity/session-auth.guard';
import {
  ImportClassStudentsDto,
  StudentImportResultDto,
} from './dto/counselor-student-import.dto';

@ApiTags('University student import')
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
@Controller('university/classes')
export class CounselorStudentImportController {
  constructor(
    @Inject(CounselorStudentImportService)
    private readonly studentImport: CounselorStudentImportService,
  ) {}

  @Post(':classId/students/import')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(CsrfGuard)
  @ApiHeader({ name: 'x-csrf-token', required: true })
  @ApiParam({ name: 'classId', format: 'uuid' })
  @ApiBody({ type: ImportClassStudentsDto })
  @ApiCreatedResponse({ type: StudentImportResultDto })
  async importStudents(
    @Param('classId', new ParseUUIDPipe({ version: '4' }))
    classId: string,
    @Body() input: ImportClassStudentsDto,
  ): Promise<StudentImportResultDto> {
    try {
      return await this.studentImport.importClassStudents(classId, input);
    } catch (error) {
      throw mapStudentImportError(error);
    }
  }
}

function mapStudentImportError(error: unknown): Error {
  if (error instanceof StudentImportDeniedError) {
    return new ForbiddenException(error.message);
  }
  if (error instanceof StudentImportClassNotFoundError) {
    return new NotFoundException(error.message);
  }
  if (error instanceof StudentCsvHeaderError) {
    return new BadRequestException(error.message);
  }
  if (error instanceof StudentCsvSizeError) {
    return new PayloadTooLargeException(error.message);
  }
  if (error instanceof OrganizationConflictError) {
    return new ConflictException(error.message);
  }
  return error instanceof Error ? error : new Error(String(error));
}
