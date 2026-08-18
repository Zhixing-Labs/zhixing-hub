import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
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
  ApiTags,
} from '@nestjs/swagger';
import {
  ActivationCodeRateLimitedError,
  ActivationCodeService,
  IdentityService,
  InvalidCaptchaError,
  InvalidCredentialsError,
  InvalidUserActivationError,
  MockIntegrationNotAllowedError,
  NewPlatformPasswordMustDifferError,
  PlatformAccountEnrollmentService,
  ProtocolConfigurationError,
  ProtocolConsentRequiredError,
  ProtocolConsentService,
  SecondFactorRequiredError,
  InvalidSmsLoginError,
  SmsLoginService,
  UserAccountActivationService,
} from '@zhixing/server-core';
import { CreatePlatformSessionDto } from './dto/create-platform-session.dto';
import { CreateUserPasswordSessionDto } from './dto/create-password-session.dto';
import {
  ConfirmedPlatformEnrollmentDto,
  ConfirmPlatformEnrollmentDto,
  FinishPlatformEnrollmentDto,
  StartedPlatformEnrollmentDto,
  StartPlatformEnrollmentDto,
} from './dto/platform-account.dto';
import { CreatedSessionDto, SessionAccountDto } from './dto/session.dto';
import {
  ActivationCodeDeliveryDto,
  CaptchaChallengeDto,
  ConfirmSmsLoginDto,
  ConfirmUserActivationDto,
  CurrentLegalDocumentDto,
  RequestSmsLoginCodeDto,
  SmsLoginCodeDeliveryDto,
  RequestUserActivationCodeDto,
} from './dto/user-activation.dto';
import {
  AuthenticatedRequest,
  SessionAuthGuard,
} from './session-auth.guard';
import {
  clearSessionCookie,
  createSessionCookie,
  readSessionToken,
} from './session-cookie';
import { CsrfGuard } from './csrf.guard';

interface HeaderResponse {
  setHeader(name: string, value: string): void;
}

@ApiTags('Identity')
@Controller('auth')
export class IdentityController {
  constructor(
    @Inject(ActivationCodeService)
    private readonly activationCodes: ActivationCodeService,
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(PlatformAccountEnrollmentService)
    private readonly platformEnrollment: PlatformAccountEnrollmentService,
    @Inject(ProtocolConsentService)
    private readonly protocolConsents: ProtocolConsentService,
    @Inject(SmsLoginService)
    private readonly smsLogin: SmsLoginService,
    @Inject(UserAccountActivationService)
    private readonly userActivation: UserAccountActivationService,
  ) {}

  @Get('legal-documents/current')
  @ApiOkResponse({ type: CurrentLegalDocumentDto, isArray: true })
  async currentLegalDocuments(): Promise<CurrentLegalDocumentDto[]> {
    try {
      return (await this.protocolConsents.getCurrentDocuments()).map(
        (document) => ({
          ...document,
          publishedAt: document.publishedAt.toISOString(),
        }),
      );
    } catch (error) {
      throw mapProtocolError(error);
    }
  }

  @Post('captcha/challenges')
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ type: CaptchaChallengeDto })
  async issueCaptchaChallenge(): Promise<CaptchaChallengeDto> {
    try {
      return await this.activationCodes.issueCaptchaChallenge();
    } catch (error) {
      if (error instanceof MockIntegrationNotAllowedError) {
        throw new ServiceUnavailableException(error.message);
      }
      throw error;
    }
  }

  @Post('user/activation/codes')
  @HttpCode(HttpStatus.CREATED)
  @ApiBody({ type: RequestUserActivationCodeDto })
  @ApiCreatedResponse({ type: ActivationCodeDeliveryDto })
  async requestUserActivationCode(
    @Body() input: RequestUserActivationCodeDto,
  ): Promise<ActivationCodeDeliveryDto> {
    try {
      return await this.userActivation.request(input);
    } catch (error) {
      if (error instanceof InvalidCaptchaError) {
        throw new UnprocessableEntityException(error.message);
      }
      if (error instanceof ActivationCodeRateLimitedError) {
        throw new HttpException(
          {
            message: error.message,
            retryAfterSeconds: error.retryAfterSeconds,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      if (error instanceof InvalidUserActivationError) {
        throw new UnauthorizedException(error.message);
      }
      if (error instanceof MockIntegrationNotAllowedError) {
        throw new ServiceUnavailableException(error.message);
      }
      throw error;
    }
  }

  @Post('user/activation/confirm')
  @HttpCode(HttpStatus.CREATED)
  @ApiBody({ type: ConfirmUserActivationDto })
  @ApiCreatedResponse({ type: CreatedSessionDto })
  async confirmUserActivation(
    @Body() input: ConfirmUserActivationDto,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) response: HeaderResponse,
  ): Promise<CreatedSessionDto> {
    try {
      const created = await this.userActivation.confirm({
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
      if (error instanceof InvalidUserActivationError) {
        throw new UnauthorizedException(error.message);
      }
      throw mapProtocolError(error);
    }
  }

  @Post('user/sms-login/codes')
  @HttpCode(HttpStatus.CREATED)
  @ApiBody({ type: RequestSmsLoginCodeDto })
  @ApiCreatedResponse({ type: SmsLoginCodeDeliveryDto })
  async requestSmsLoginCode(
    @Body() input: RequestSmsLoginCodeDto,
  ): Promise<SmsLoginCodeDeliveryDto> {
    try {
      return await this.smsLogin.request(input);
    } catch (error) {
      if (error instanceof InvalidCaptchaError) {
        throw new UnprocessableEntityException(error.message);
      }
      if (error instanceof ActivationCodeRateLimitedError) {
        throw new HttpException(
          {
            message: error.message,
            retryAfterSeconds: error.retryAfterSeconds,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      if (error instanceof InvalidSmsLoginError) {
        throw new UnauthorizedException(error.message);
      }
      if (error instanceof MockIntegrationNotAllowedError) {
        throw new ServiceUnavailableException(error.message);
      }
      throw error;
    }
  }

  @Post('user/sms-login/confirm')
  @HttpCode(HttpStatus.CREATED)
  @ApiBody({ type: ConfirmSmsLoginDto })
  @ApiCreatedResponse({ type: CreatedSessionDto })
  async confirmSmsLogin(
    @Body() input: ConfirmSmsLoginDto,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) response: HeaderResponse,
  ): Promise<CreatedSessionDto> {
    try {
      const created = await this.smsLogin.confirm({
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
      if (error instanceof SecondFactorRequiredError) {
        throw new HttpException(
          { message: error.message, secondFactorRequired: true },
          HttpStatus.PRECONDITION_REQUIRED,
        );
      }
      if (error instanceof InvalidSmsLoginError) {
        throw new UnauthorizedException(error.message);
      }
      throw mapProtocolError(error);
    }
  }

  @Post('sessions')
  @HttpCode(HttpStatus.CREATED)
  @ApiBody({ type: CreateUserPasswordSessionDto })
  @ApiCreatedResponse({ type: CreatedSessionDto })
  async createUserPasswordSession(
    @Body() input: CreateUserPasswordSessionDto,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) response: HeaderResponse,
  ): Promise<CreatedSessionDto> {
    try {
      const created = await this.identity.createUserPasswordSession({
        phone: input.phone,
        password: input.password,
        secondFactorCode: input.secondFactorCode,
        consentDocumentVersionIds: input.consentDocumentVersionIds,
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
      if (error instanceof SecondFactorRequiredError) {
        throw new HttpException(
          { message: error.message, secondFactorRequired: true },
          HttpStatus.PRECONDITION_REQUIRED,
        );
      }
      if (error instanceof InvalidCredentialsError) {
        throw new UnauthorizedException('Invalid phone or password');
      }
      throw mapProtocolError(error);
    }
  }

  @Post('platform/sessions')
  @HttpCode(HttpStatus.CREATED)
  @ApiBody({ type: CreatePlatformSessionDto })
  @ApiCreatedResponse({ type: CreatedSessionDto })
  async createPlatformSession(
    @Body() input: CreatePlatformSessionDto,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) response: HeaderResponse,
  ): Promise<CreatedSessionDto> {
    try {
      const created = await this.identity.createPlatformSession({
        username: input.username,
        password: input.password,
        secondFactorCode: input.secondFactorCode,
        consentDocumentVersionIds: input.consentDocumentVersionIds,
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
      if (error instanceof InvalidCredentialsError) {
        throw new UnauthorizedException(
          'Invalid username, password, or second factor',
        );
      }
      throw mapProtocolError(error);
    }
  }

  @Post('platform/enrollments')
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.CREATED)
  @ApiBody({ type: StartPlatformEnrollmentDto })
  @ApiCreatedResponse({ type: StartedPlatformEnrollmentDto })
  async startPlatformEnrollment(
    @Body() input: StartPlatformEnrollmentDto,
  ): Promise<StartedPlatformEnrollmentDto> {
    try {
      const started = await this.platformEnrollment.start(input);
      return {
        enrollmentToken: started.enrollmentToken,
        totpSecret: started.totpSecret,
        totpUri: started.totpUri,
        expiresAt: started.expiresAt.toISOString(),
      };
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        throw new UnauthorizedException(
          'Invalid username or one-time initial password',
        );
      }
      throw mapProtocolError(error);
    }
  }

  @Post('platform/enrollments/confirm')
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.CREATED)
  @ApiBody({ type: ConfirmPlatformEnrollmentDto })
  @ApiCreatedResponse({ type: ConfirmedPlatformEnrollmentDto })
  async confirmPlatformEnrollment(
    @Body() input: ConfirmPlatformEnrollmentDto,
  ): Promise<ConfirmedPlatformEnrollmentDto> {
    try {
      const confirmed = await this.platformEnrollment.confirm(input);
      return {
        recoveryCodesConfirmationToken:
          confirmed.recoveryCodesConfirmationToken,
        expiresAt: confirmed.expiresAt.toISOString(),
        recoveryCodes: confirmed.recoveryCodes,
      };
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        throw new UnauthorizedException(
          'Enrollment token or TOTP code is invalid',
        );
      }
      if (error instanceof NewPlatformPasswordMustDifferError) {
        throw new UnprocessableEntityException(error.message);
      }
      throw error;
    }
  }

  @Post('platform/enrollments/finish')
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.CREATED)
  @ApiBody({ type: FinishPlatformEnrollmentDto })
  @ApiCreatedResponse({ type: CreatedSessionDto })
  async finishPlatformEnrollment(
    @Body() input: FinishPlatformEnrollmentDto,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) response: HeaderResponse,
  ): Promise<CreatedSessionDto> {
    try {
      const created = await this.platformEnrollment.finish({
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
      if (error instanceof InvalidCredentialsError) {
        throw new UnauthorizedException(
          'Recovery-code confirmation token is invalid or expired',
        );
      }
      throw mapProtocolError(error);
    }
  }

  @Get('sessions/current')
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth()
  @ApiOkResponse({ type: SessionAccountDto })
  currentSession(@Req() request: AuthenticatedRequest): SessionAccountDto {
    if (!request.auth) {
      throw new UnauthorizedException();
    }
    return request.auth;
  }

  @Delete('sessions/current')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionAuthGuard, CsrfGuard)
  @ApiCookieAuth()
  @ApiHeader({ name: 'x-csrf-token', required: true })
  @ApiNoContentResponse()
  async revokeCurrentSession(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: HeaderResponse,
  ): Promise<void> {
    const cookie = request.headers.cookie;
    const cookieHeader = Array.isArray(cookie) ? cookie[0] : cookie;
    const token = readSessionToken(cookieHeader);
    if (token) {
      await this.identity.revokeSession(token);
    }
    response.setHeader('Set-Cookie', clearSessionCookie());
  }
}

function mapProtocolError(error: unknown): Error {
  if (error instanceof ProtocolConsentRequiredError) {
    return new UnprocessableEntityException(error.message);
  }
  if (error instanceof ProtocolConfigurationError) {
    return new ServiceUnavailableException(error.message);
  }
  return error instanceof Error ? error : new Error(String(error));
}
