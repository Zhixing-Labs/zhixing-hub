import { Injectable } from '@nestjs/common';
import {
  LegalDocumentStatus,
  LegalDocumentType,
  MembershipRole,
  Prisma,
  TenantType,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RequestContextService } from '../../infrastructure/request-context/request-context.service';

export interface LegalDocumentDraftInput {
  type: LegalDocumentType;
  version: string;
  content: string;
}

export class LegalGovernanceDeniedError extends Error {
  constructor() {
    super('Only a platform operations specialist can manage legal documents');
    this.name = 'LegalGovernanceDeniedError';
  }
}

export class LegalDocumentNotFoundError extends Error {
  constructor() {
    super('Legal document draft does not exist');
    this.name = 'LegalDocumentNotFoundError';
  }
}

export class LegalDocumentConflictError extends Error {
  constructor(message = 'Legal document version already exists') {
    super(message);
    this.name = 'LegalDocumentConflictError';
  }
}

@Injectable()
export class LegalDocumentGovernanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
  ) {}

  async list() {
    await this.requireOperationsSpecialist();
    return this.prisma.legalDocumentVersion.findMany({
      orderBy: [{ type: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async createDraft(input: LegalDocumentDraftInput) {
    const actor = await this.requireOperationsSpecialist();
    const content = requireContent(input.content);
    try {
      const document = await this.prisma.legalDocumentVersion.create({
        data: {
          type: input.type,
          version: input.version.trim(),
          status: LegalDocumentStatus.DRAFT,
          content,
          contentHash: hashContent(content),
          createdByAccountId: actor.accountId,
        },
      });
      await this.writeAudit(actor, 'legal_document.draft_created', document.id, {
        type: document.type,
        version: document.version,
      });
      return document;
    } catch (error) {
      throw mapPersistenceError(error);
    }
  }

  async updateDraft(id: string, input: LegalDocumentDraftInput) {
    const actor = await this.requireOperationsSpecialist();
    const existing = await this.prisma.legalDocumentVersion.findUnique({
      where: { id },
    });
    if (!existing || existing.status !== LegalDocumentStatus.DRAFT) {
      throw new LegalDocumentNotFoundError();
    }

    const content = requireContent(input.content);
    try {
      const document = await this.prisma.legalDocumentVersion.update({
        where: { id },
        data: {
          type: input.type,
          version: input.version.trim(),
          content,
          contentHash: hashContent(content),
        },
      });
      await this.writeAudit(actor, 'legal_document.draft_updated', id, {
        type: document.type,
        version: document.version,
      });
      return document;
    } catch (error) {
      throw mapPersistenceError(error);
    }
  }

  async publishSet(
    userAgreementDraftId: string,
    privacyPolicyDraftId: string,
  ): Promise<void> {
    const actor = await this.requireOperationsSpecialist();
    await this.prisma.$transaction(async (transaction) => {
      const drafts = await transaction.legalDocumentVersion.findMany({
        where: {
          id: { in: [userAgreementDraftId, privacyPolicyDraftId] },
          status: LegalDocumentStatus.DRAFT,
        },
      });
      const userAgreement = drafts.find(
        (draft) =>
          draft.id === userAgreementDraftId &&
          draft.type === LegalDocumentType.USER_AGREEMENT,
      );
      const privacyPolicy = drafts.find(
        (draft) =>
          draft.id === privacyPolicyDraftId &&
          draft.type === LegalDocumentType.PRIVACY_POLICY,
      );
      if (!userAgreement || !privacyPolicy) {
        throw new LegalDocumentConflictError(
          'A publish set requires one draft of each legal document type',
        );
      }

      const publishedAt = new Date();
      await transaction.legalDocumentVersion.updateMany({
        where: { status: LegalDocumentStatus.PUBLISHED },
        data: { status: LegalDocumentStatus.RETIRED },
      });
      await transaction.legalDocumentVersion.updateMany({
        where: { id: { in: [userAgreement.id, privacyPolicy.id] } },
        data: {
          status: LegalDocumentStatus.PUBLISHED,
          publishedAt,
          publishedByAccountId: actor.accountId,
        },
      });
      await transaction.auditEvent.create({
        data: {
          tenantId: actor.tenantId,
          actorAccountId: actor.accountId,
          action: 'legal_document.set_published',
          targetType: 'legal_document_set',
          requestId: actor.requestId,
          after: {
            userAgreement: {
              id: userAgreement.id,
              version: userAgreement.version,
            },
            privacyPolicy: {
              id: privacyPolicy.id,
              version: privacyPolicy.version,
            },
            publishedAt: publishedAt.toISOString(),
          },
        },
      });
    });
  }

  private async requireOperationsSpecialist(): Promise<{
    accountId: string;
    tenantId: string;
    requestId: string;
  }> {
    const current = this.context.requireCurrent();
    if (
      !current.actorAccountId ||
      !current.tenantId ||
      current.role !== MembershipRole.OPERATIONS_SPECIALIST
    ) {
      throw new LegalGovernanceDeniedError();
    }
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: current.tenantId },
      select: { type: true },
    });
    if (tenant?.type !== TenantType.PLATFORM) {
      throw new LegalGovernanceDeniedError();
    }
    return {
      accountId: current.actorAccountId,
      tenantId: current.tenantId,
      requestId: current.requestId,
    };
  }

  private async writeAudit(
    actor: { accountId: string; tenantId: string; requestId: string },
    action: string,
    targetId: string,
    after: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.prisma.auditEvent.create({
      data: {
        tenantId: actor.tenantId,
        actorAccountId: actor.accountId,
        action,
        targetType: 'legal_document',
        targetId,
        requestId: actor.requestId,
        after,
      },
    });
  }
}

function requireContent(content: string): string {
  const normalized = content.trim();
  if (!normalized) {
    throw new LegalDocumentConflictError('Legal document content is required');
  }
  return normalized;
}

function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function mapPersistenceError(error: unknown): Error {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    return new LegalDocumentConflictError();
  }
  return error instanceof Error ? error : new Error(String(error));
}
