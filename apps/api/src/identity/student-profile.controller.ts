import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Patch,
  Post,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  InvalidProfileInputError,
  ProfileCompletionConflictError,
  ProfileFrozenError,
  ResidentCityNotAllowedError,
  SelfEditRateLimitedError,
  StudentProfileService,
} from '@zhixing/server-core';
import { CsrfGuard } from './csrf.guard';
import { SessionAuthGuard } from './session-auth.guard';
import {
  CompleteFirstLoginProfileDto,
  MyProfileDto,
  SelfCorrectProfileDto,
  UpdateResidentCityDto,
} from './dto/platform-student-account.dto';

@ApiTags('Student profile')
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
@Controller('account/me')
export class StudentProfileController {
  constructor(
    @Inject(StudentProfileService)
    private readonly profile: StudentProfileService,
  ) {}

  @Get('profile')
  @ApiOkResponse({ type: MyProfileDto })
  async getMyProfile(): Promise<MyProfileDto> {
    try {
      return await this.profile.getMyProfile();
    } catch (error) {
      throw mapProfileError(error);
    }
  }

  @Post('profile/completion')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiHeader({ name: 'x-csrf-token', required: true })
  @ApiBody({ type: CompleteFirstLoginProfileDto })
  @ApiOkResponse({ type: MyProfileDto })
  async completeFirstLogin(
    @Body() input: CompleteFirstLoginProfileDto,
  ): Promise<MyProfileDto> {
    try {
      return await this.profile.completeFirstLogin(input);
    } catch (error) {
      throw mapProfileError(error);
    }
  }

  @Patch('resident-city')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CsrfGuard)
  @ApiHeader({ name: 'x-csrf-token', required: true })
  @ApiBody({ type: UpdateResidentCityDto })
  @ApiNoContentResponse()
  async updateResidentCity(
    @Body() input: UpdateResidentCityDto,
  ): Promise<void> {
    try {
      await this.profile.updateResidentCity(input.residentCityCode);
    } catch (error) {
      throw mapProfileError(error);
    }
  }

  @Patch('platform-profile')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiHeader({ name: 'x-csrf-token', required: true })
  @ApiBody({ type: SelfCorrectProfileDto })
  @ApiOkResponse({ type: MyProfileDto })
  async selfCorrectProfile(
    @Body() input: SelfCorrectProfileDto,
  ): Promise<MyProfileDto> {
    try {
      return await this.profile.selfCorrectProfile(input);
    } catch (error) {
      throw mapProfileError(error);
    }
  }
}

function mapProfileError(error: unknown): Error {
  if (error instanceof ProfileCompletionConflictError) {
    return new ConflictException(error.message);
  }
  if (error instanceof ProfileFrozenError) {
    return new UnprocessableEntityException(error.message);
  }
  if (error instanceof SelfEditRateLimitedError) {
    return new UnprocessableEntityException(error.message);
  }
  if (error instanceof ResidentCityNotAllowedError) {
    return new UnprocessableEntityException(error.message);
  }
  if (error instanceof InvalidProfileInputError) {
    return new UnprocessableEntityException(error.message);
  }
  return error instanceof Error ? error : new Error(String(error));
}
