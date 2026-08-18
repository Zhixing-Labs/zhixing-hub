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
  ServiceUnavailableException,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  ActivationCodeRateLimitedError,
  CounselorPhoneChangeDeniedError,
  InvalidCaptchaError,
  MockIntegrationNotAllowedError,
  PhoneChangeInvalidError,
  PhoneChangeRequestNotFoundError,
  PhoneChangeService,
  PhoneChangeTargetOccupiedError,
} from '@zhixing/server-core';
import { CsrfGuard } from './csrf.guard';
import { SessionAuthGuard } from './session-auth.guard';
import { ActivationCodeDeliveryDto } from './dto/user-activation.dto';
import {
  CounselorInitiatePhoneChangeDto,
  CounselorResolvePhoneChangeDto,
  CounselorVerifyPhoneChangeDto,
  PendingPhoneChangeDto,
} from './dto/platform-student-account.dto';

@ApiTags('Counselor phone change')
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
@Controller('university')
export class CounselorPhoneChangeController {
  constructor(
    @Inject(PhoneChangeService)
    private readonly phoneChange: PhoneChangeService,
  ) {}

  @Get('students/phone-change-requests')
  @ApiOkResponse({ type: PendingPhoneChangeDto, isArray: true })
  async listPending(): Promise<PendingPhoneChangeDto[]> {
    try {
      return await this.phoneChange.listPendingForCounselor();
    } catch (error) {
      throw mapCounselorPhoneChangeError(error);
    }
  }

  @Post('students/:accountId/phone-change/initiate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiHeader({ name: 'x-csrf-token', required: true })
  @ApiParam({ name: 'accountId', format: 'uuid' })
  @ApiBody({ type: CounselorInitiatePhoneChangeDto })
  @ApiOkResponse({ type: ActivationCodeDeliveryDto })
  async initiate(
    @Param('accountId', new ParseUUIDPipe({ version: '4' }))
    accountId: string,
    @Body() input: CounselorInitiatePhoneChangeDto,
  ): Promise<ActivationCodeDeliveryDto> {
    try {
      return await this.phoneChange.counselorInitiate({
        studentAccountId: accountId,
        newPhone: input.newPhone,
        captchaToken: input.captchaToken,
      });
    } catch (error) {
      throw mapCounselorPhoneChangeError(error);
    }
  }

  @Post('phone-change-requests/:requestId/verify')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CsrfGuard)
  @ApiHeader({ name: 'x-csrf-token', required: true })
  @ApiParam({ name: 'requestId', format: 'uuid' })
  @ApiBody({ type: CounselorVerifyPhoneChangeDto })
  @ApiNoContentResponse()
  async verify(
    @Param('requestId', new ParseUUIDPipe({ version: '4' }))
    requestId: string,
    @Body() input: CounselorVerifyPhoneChangeDto,
  ): Promise<void> {
    try {
      await this.phoneChange.counselorVerify({ requestId, code: input.code });
    } catch (error) {
      throw mapCounselorPhoneChangeError(error);
    }
  }

  @Post('phone-change-requests/:requestId/resolve')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CsrfGuard)
  @ApiHeader({ name: 'x-csrf-token', required: true })
  @ApiParam({ name: 'requestId', format: 'uuid' })
  @ApiBody({ type: CounselorResolvePhoneChangeDto })
  @ApiNoContentResponse()
  async resolve(
    @Param('requestId', new ParseUUIDPipe({ version: '4' }))
    requestId: string,
    @Body() input: CounselorResolvePhoneChangeDto,
  ): Promise<void> {
    try {
      await this.phoneChange.counselorResolve({
        requestId,
        approve: input.approve,
      });
    } catch (error) {
      throw mapCounselorPhoneChangeError(error);
    }
  }
}

function mapCounselorPhoneChangeError(error: unknown): Error {
  if (error instanceof CounselorPhoneChangeDeniedError) {
    return new ForbiddenException(error.message);
  }
  if (error instanceof PhoneChangeRequestNotFoundError) {
    return new NotFoundException(error.message);
  }
  if (error instanceof PhoneChangeInvalidError) {
    return new UnprocessableEntityException(error.message);
  }
  if (error instanceof PhoneChangeTargetOccupiedError) {
    return new ConflictException(error.message);
  }
  if (error instanceof InvalidCaptchaError) {
    return new UnprocessableEntityException(error.message);
  }
  if (error instanceof ActivationCodeRateLimitedError) {
    return new ConflictException(error.message);
  }
  if (error instanceof MockIntegrationNotAllowedError) {
    return new ServiceUnavailableException(error.message);
  }
  return error instanceof Error ? error : new Error(String(error));
}
