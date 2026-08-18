import {
  Body,
  ConflictException,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  ServiceUnavailableException,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  ActivationCodeRateLimitedError,
  InvalidCaptchaError,
  MockIntegrationNotAllowedError,
  PhoneChangeInvalidError,
  PhoneChangeService,
  PhoneChangeTargetOccupiedError,
} from '@zhixing/server-core';
import { CsrfGuard } from './csrf.guard';
import { SessionAuthGuard } from './session-auth.guard';
import { ActivationCodeDeliveryDto } from './dto/user-activation.dto';
import {
  ConfirmPhoneChangeDto,
  PhoneChangeConfirmResultDto,
  RequestPhoneChangeNewCodeDto,
  RequestPhoneChangeOldCodeDto,
} from './dto/platform-student-account.dto';

@ApiTags('Phone change')
@ApiCookieAuth()
@UseGuards(SessionAuthGuard, CsrfGuard)
@ApiHeader({ name: 'x-csrf-token', required: true })
@Controller('account/phone-change')
export class PhoneChangeController {
  constructor(
    @Inject(PhoneChangeService)
    private readonly phoneChange: PhoneChangeService,
  ) {}

  @Post('old-phone/code')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: RequestPhoneChangeOldCodeDto })
  @ApiOkResponse({ type: ActivationCodeDeliveryDto })
  async requestOldCode(
    @Body() input: RequestPhoneChangeOldCodeDto,
  ): Promise<ActivationCodeDeliveryDto> {
    try {
      return await this.phoneChange.requestOldVerification(input);
    } catch (error) {
      throw mapPhoneChangeError(error);
    }
  }

  @Post('new-phone/code')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: RequestPhoneChangeNewCodeDto })
  @ApiOkResponse({ type: ActivationCodeDeliveryDto })
  async requestNewCode(
    @Body() input: RequestPhoneChangeNewCodeDto,
  ): Promise<ActivationCodeDeliveryDto> {
    try {
      return await this.phoneChange.requestNewVerification(input);
    } catch (error) {
      throw mapPhoneChangeError(error);
    }
  }

  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: ConfirmPhoneChangeDto })
  @ApiOkResponse({ type: PhoneChangeConfirmResultDto })
  async confirm(
    @Body() input: ConfirmPhoneChangeDto,
  ): Promise<PhoneChangeConfirmResultDto> {
    try {
      return await this.phoneChange.confirmSelf(input);
    } catch (error) {
      throw mapPhoneChangeError(error);
    }
  }
}

function mapPhoneChangeError(error: unknown): Error {
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
