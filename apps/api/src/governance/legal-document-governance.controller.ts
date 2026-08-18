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
  Put,
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
  LegalDocumentConflictError,
  LegalDocumentGovernanceService,
  LegalDocumentNotFoundError,
  LegalGovernanceDeniedError,
} from '@zhixing/server-core';
import { CsrfGuard } from '../identity/csrf.guard';
import { SessionAuthGuard } from '../identity/session-auth.guard';
import {
  LegalDocumentDraftDto,
  PublishLegalDocumentSetDto,
  SaveLegalDocumentDraftDto,
} from './dto/legal-document.dto';

@ApiTags('Governance legal documents')
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
@Controller('governance/legal-documents')
export class LegalDocumentGovernanceController {
  constructor(
    @Inject(LegalDocumentGovernanceService)
    private readonly legalDocuments: LegalDocumentGovernanceService,
  ) {}

  @Get()
  @ApiOkResponse({ type: LegalDocumentDraftDto, isArray: true })
  async list(): Promise<LegalDocumentDraftDto[]> {
    try {
      return (await this.legalDocuments.list()).map(toDto);
    } catch (error) {
      throw mapGovernanceError(error);
    }
  }

  @Post()
  @UseGuards(CsrfGuard)
  @ApiHeader({ name: 'x-csrf-token', required: true })
  @ApiBody({ type: SaveLegalDocumentDraftDto })
  @ApiCreatedResponse({ type: LegalDocumentDraftDto })
  async create(
    @Body() input: SaveLegalDocumentDraftDto,
  ): Promise<LegalDocumentDraftDto> {
    try {
      return toDto(await this.legalDocuments.createDraft(input));
    } catch (error) {
      throw mapGovernanceError(error);
    }
  }

  @Put(':id')
  @UseGuards(CsrfGuard)
  @ApiHeader({ name: 'x-csrf-token', required: true })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: SaveLegalDocumentDraftDto })
  @ApiOkResponse({ type: LegalDocumentDraftDto })
  async update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: SaveLegalDocumentDraftDto,
  ): Promise<LegalDocumentDraftDto> {
    try {
      return toDto(await this.legalDocuments.updateDraft(id, input));
    } catch (error) {
      throw mapGovernanceError(error);
    }
  }

  @Post('publish-set')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CsrfGuard)
  @ApiHeader({ name: 'x-csrf-token', required: true })
  @ApiBody({ type: PublishLegalDocumentSetDto })
  @ApiNoContentResponse()
  async publishSet(
    @Body() input: PublishLegalDocumentSetDto,
  ): Promise<void> {
    try {
      await this.legalDocuments.publishSet(
        input.userAgreementDraftId,
        input.privacyPolicyDraftId,
      );
    } catch (error) {
      throw mapGovernanceError(error);
    }
  }
}

function toDto(document: {
  id: string;
  type: 'USER_AGREEMENT' | 'PRIVACY_POLICY';
  version: string;
  status: 'DRAFT' | 'PUBLISHED' | 'RETIRED';
  content: string;
  contentHash: string;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): LegalDocumentDraftDto {
  return {
    id: document.id,
    type: document.type,
    version: document.version,
    status: document.status,
    content: document.content,
    contentHash: document.contentHash,
    publishedAt: document.publishedAt?.toISOString() ?? null,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

function mapGovernanceError(error: unknown): Error {
  if (error instanceof LegalGovernanceDeniedError) {
    return new ForbiddenException(error.message);
  }
  if (error instanceof LegalDocumentNotFoundError) {
    return new NotFoundException(error.message);
  }
  if (error instanceof LegalDocumentConflictError) {
    return new ConflictException(error.message);
  }
  return error instanceof Error ? error : new Error(String(error));
}
