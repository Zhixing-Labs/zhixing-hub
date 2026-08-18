import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
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
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  InvalidManagedPlatformRoleError,
  PlatformAccountAdminService,
  PlatformAccountConflictError,
  PlatformAccountNotFoundError,
  SuperAdminRequiredError,
} from '@zhixing/server-core';
import { CsrfGuard } from './csrf.guard';
import {
  CreatedPlatformAccountDto,
  CreatePlatformAccountDto,
} from './dto/platform-account.dto';
import { SessionAuthGuard } from './session-auth.guard';

@ApiTags('Platform accounts')
@ApiCookieAuth()
@ApiHeader({ name: 'x-csrf-token', required: true })
@UseGuards(SessionAuthGuard, CsrfGuard)
@Controller('platform/accounts')
export class PlatformAccountController {
  constructor(
    @Inject(PlatformAccountAdminService)
    private readonly accounts: PlatformAccountAdminService,
  ) {}

  @Post()
  @Header('Cache-Control', 'no-store')
  @ApiBody({ type: CreatePlatformAccountDto })
  @ApiCreatedResponse({ type: CreatedPlatformAccountDto })
  async create(
    @Body() input: CreatePlatformAccountDto,
  ): Promise<CreatedPlatformAccountDto> {
    try {
      return await this.accounts.create(input);
    } catch (error) {
      throw mapPlatformAccountError(error);
    }
  }

  @Patch(':accountId/disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'accountId', format: 'uuid' })
  @ApiNoContentResponse()
  async disable(
    @Param('accountId', new ParseUUIDPipe({ version: '4' }))
    accountId: string,
  ): Promise<void> {
    try {
      await this.accounts.disable(accountId);
    } catch (error) {
      throw mapPlatformAccountError(error);
    }
  }

  @Post(':accountId/totp-reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'accountId', format: 'uuid' })
  @ApiNoContentResponse()
  async resetTotp(
    @Param('accountId', new ParseUUIDPipe({ version: '4' }))
    accountId: string,
  ): Promise<void> {
    try {
      await this.accounts.resetTotp(accountId);
    } catch (error) {
      throw mapPlatformAccountError(error);
    }
  }
}

function mapPlatformAccountError(error: unknown): Error {
  if (error instanceof SuperAdminRequiredError) {
    return new ForbiddenException(error.message);
  }
  if (error instanceof PlatformAccountConflictError) {
    return new ConflictException(error.message);
  }
  if (error instanceof PlatformAccountNotFoundError) {
    return new NotFoundException(error.message);
  }
  if (error instanceof InvalidManagedPlatformRoleError) {
    return new UnprocessableEntityException(error.message);
  }
  return error instanceof Error ? error : new Error(String(error));
}
