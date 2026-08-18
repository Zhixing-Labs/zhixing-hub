import {
  Body,
  ConflictException,
  Controller,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  ActivationCodeRateLimitedError,
  InvalidCaptchaError,
  InvalidRegistrationError,
  MockIntegrationNotAllowedError,
  PlatformStudentRegistrationService,
  ProtocolConfigurationError,
  ProtocolConsentRequiredError,
  PublicAcademyNotConfiguredError,
  RegistrationCityUnavailableError,
  RegistrationPhoneOccupiedError,
} from '@zhixing/server-core';
import { CreatedSessionDto } from './dto/session.dto';
import {
  ConfirmRegistrationDto,
  RequestRegistrationCodeDto,
} from './dto/platform-student-account.dto';
import {
  ActivationCodeDeliveryDto,
} from './dto/user-activation.dto';
import { createSessionCookie } from './session-cookie';

interface HeaderResponse {
  setHeader(name: string, value: string): void;
}

@ApiTags('Platform student registration')
@Controller('account/platform-registration')
export class PlatformRegistrationController {
  constructor(
    @Inject(PlatformStudentRegistrationService)
    private readonly registration: PlatformStudentRegistrationService,
  ) {}

  @Post('codes')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: RequestRegistrationCodeDto })
  @ApiOkResponse({ type: ActivationCodeDeliveryDto })
  async requestCode(
    @Body() input: RequestRegistrationCodeDto,
  ): Promise<ActivationCodeDeliveryDto> {
    try {
      return await this.registration.request(input);
    } catch (error) {
      throw mapRegistrationError(error);
    }
  }

  @Post('confirm')
  @ApiBody({ type: ConfirmRegistrationDto })
  @ApiCreatedResponse({ type: CreatedSessionDto })
  async confirm(
    @Body() input: ConfirmRegistrationDto,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) response: HeaderResponse,
  ): Promise<CreatedSessionDto> {
    try {
      const created = await this.registration.confirm({
        ...input,
        deviceSummary: userAgent,
      });
      response.setHeader(
        'Set-Cookie',
        createSessionCookie(created.token, created.expiresAt),
      );
      return {
        csrfToken: created.csrfToken,
        expiresAt: created.expiresAt.toISOString(),
        account: created.account,
      };
    } catch (error) {
      throw mapRegistrationError(error);
    }
  }
}

function mapRegistrationError(error: unknown): Error {
  if (error instanceof RegistrationPhoneOccupiedError) {
    return new ConflictException(error.message);
  }
  if (error instanceof RegistrationCityUnavailableError) {
    return new UnprocessableEntityException(error.message);
  }
  if (error instanceof PublicAcademyNotConfiguredError) {
    return new ServiceUnavailableException(error.message);
  }
  if (error instanceof InvalidRegistrationError) {
    return new UnauthorizedException(error.message);
  }
  if (error instanceof InvalidCaptchaError) {
    return new UnprocessableEntityException(error.message);
  }
  if (error instanceof ActivationCodeRateLimitedError) {
    return new HttpException(
      { message: error.message, retryAfterSeconds: error.retryAfterSeconds },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
  if (
    error instanceof ProtocolConsentRequiredError ||
    error instanceof ProtocolConfigurationError
  ) {
    return new UnprocessableEntityException(error.message);
  }
  if (error instanceof MockIntegrationNotAllowedError) {
    return new ServiceUnavailableException(error.message);
  }
  return error instanceof Error ? error : new Error(String(error));
}
