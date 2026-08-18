import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Header,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Res,
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
  ApiTags,
} from '@nestjs/swagger';
import {
  AccountSecurityService,
  InvalidCredentialsError,
  NewPasswordMustDifferError,
  OrdinaryAccountRequiredError,
  SecondFactorRequiredError,
  TotpAlreadyEnabledError,
  TotpNotEnabledError,
} from '@zhixing/server-core';
import { CsrfGuard } from './csrf.guard';
import {
  ChangePasswordDto,
  ConfirmTotpEnrollmentDto,
  DisableTotpDto,
  RecoveryCodesDto,
  StartedTotpEnrollmentDto,
  StartTotpEnrollmentDto,
} from './dto/account-security.dto';
import { SessionAuthGuard } from './session-auth.guard';
import { clearSessionCookie } from './session-cookie';

interface HeaderResponse {
  setHeader(name: string, value: string): void;
}

@ApiTags('Account security')
@ApiCookieAuth()
@ApiHeader({ name: 'x-csrf-token', required: true })
@UseGuards(SessionAuthGuard, CsrfGuard)
@Controller('account/security')
export class AccountSecurityController {
  constructor(
    @Inject(AccountSecurityService)
    private readonly security: AccountSecurityService,
  ) {}

  @Post('totp/enrollments')
  @Header('Cache-Control', 'no-store')
  @ApiBody({ type: StartTotpEnrollmentDto })
  @ApiCreatedResponse({ type: StartedTotpEnrollmentDto })
  async startTotpEnrollment(
    @Body() input: StartTotpEnrollmentDto,
  ): Promise<StartedTotpEnrollmentDto> {
    try {
      return await this.security.startTotpEnrollment(input.password);
    } catch (error) {
      throw mapSecurityError(error);
    }
  }

  @Post('totp/enrollments/confirm')
  @Header('Cache-Control', 'no-store')
  @ApiBody({ type: ConfirmTotpEnrollmentDto })
  @ApiCreatedResponse({ type: RecoveryCodesDto })
  async confirmTotpEnrollment(
    @Body() input: ConfirmTotpEnrollmentDto,
  ): Promise<RecoveryCodesDto> {
    try {
      return {
        recoveryCodes: await this.security.confirmTotpEnrollment(
          input.totpCode,
        ),
      };
    } catch (error) {
      throw mapSecurityError(error);
    }
  }

  @Post('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBody({ type: ChangePasswordDto })
  @ApiNoContentResponse()
  async changePassword(
    @Body() input: ChangePasswordDto,
    @Res({ passthrough: true }) response: HeaderResponse,
  ): Promise<void> {
    try {
      await this.security.changePassword(
        input.currentPassword,
        input.newPassword,
        input.secondFactorCode,
      );
      response.setHeader('Set-Cookie', clearSessionCookie());
    } catch (error) {
      throw mapSecurityError(error);
    }
  }

  @Post('totp/disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBody({ type: DisableTotpDto })
  @ApiNoContentResponse()
  async disableTotp(
    @Body() input: DisableTotpDto,
    @Res({ passthrough: true }) response: HeaderResponse,
  ): Promise<void> {
    try {
      await this.security.disableTotp(
        input.password,
        input.secondFactorCode,
      );
      response.setHeader('Set-Cookie', clearSessionCookie());
    } catch (error) {
      throw mapSecurityError(error);
    }
  }
}

function mapSecurityError(error: unknown): Error {
  if (error instanceof SecondFactorRequiredError) {
    return new HttpException(
      { message: error.message, secondFactorRequired: true },
      HttpStatus.PRECONDITION_REQUIRED,
    );
  }
  if (error instanceof InvalidCredentialsError) {
    return new UnauthorizedException('Security verification failed');
  }
  if (error instanceof OrdinaryAccountRequiredError) {
    return new ForbiddenException(error.message);
  }
  if (
    error instanceof TotpAlreadyEnabledError ||
    error instanceof TotpNotEnabledError
  ) {
    return new ConflictException(error.message);
  }
  if (error instanceof NewPasswordMustDifferError) {
    return new UnprocessableEntityException(error.message);
  }
  return error instanceof Error ? error : new Error(String(error));
}
