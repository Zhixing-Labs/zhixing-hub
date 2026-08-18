import {
  ConflictException,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiHeader,
  ApiNoContentResponse,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  CounselorRequiredError,
  CounselorStudentSecurityService,
  StudentTotpReliefNotFoundError,
  TotpNotEnabledError,
} from '@zhixing/server-core';
import { CsrfGuard } from './csrf.guard';
import { SessionAuthGuard } from './session-auth.guard';

@ApiTags('University student security')
@ApiCookieAuth()
@ApiHeader({ name: 'x-csrf-token', required: true })
@UseGuards(SessionAuthGuard, CsrfGuard)
@Controller('university/students')
export class StudentSecurityController {
  constructor(
    @Inject(CounselorStudentSecurityService)
    private readonly students: CounselorStudentSecurityService,
  ) {}

  @Post(':accountId/totp-disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'accountId', format: 'uuid' })
  @ApiNoContentResponse()
  async disableStudentTotp(
    @Param('accountId', new ParseUUIDPipe({ version: '4' }))
    accountId: string,
  ): Promise<void> {
    try {
      await this.students.disableStudentTotp(accountId);
    } catch (error) {
      throw mapStudentSecurityError(error);
    }
  }
}

function mapStudentSecurityError(error: unknown): Error {
  if (error instanceof CounselorRequiredError) {
    return new ForbiddenException(error.message);
  }
  if (error instanceof StudentTotpReliefNotFoundError) {
    return new NotFoundException(error.message);
  }
  if (error instanceof TotpNotEnabledError) {
    return new ConflictException(error.message);
  }
  return error instanceof Error ? error : new Error(String(error));
}
