import { Injectable } from '@nestjs/common';
import {
  LegalDocumentType,
  LegalDocumentVersion,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

const REQUIRED_DOCUMENT_TYPES = new Set<LegalDocumentType>([
  LegalDocumentType.USER_AGREEMENT,
  LegalDocumentType.PRIVACY_POLICY,
]);

export interface CurrentLegalDocument {
  id: string;
  type: LegalDocumentType;
  version: string;
  content: string;
  contentHash: string;
  publishedAt: Date;
}

export class ProtocolConsentRequiredError extends Error {
  constructor() {
    super('Current user agreement and privacy policy must be accepted');
    this.name = 'ProtocolConsentRequiredError';
  }
}

export class ProtocolConfigurationError extends Error {
  constructor() {
    super('Published legal document set is incomplete');
    this.name = 'ProtocolConfigurationError';
  }
}

@Injectable()
export class ProtocolConsentService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrentDocuments(): Promise<CurrentLegalDocument[]> {
    const documents = await this.prisma.legalDocumentVersion.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { type: 'asc' },
    });
    return normalizeCurrentDocuments(documents);
  }

  async assertCurrentDocumentIds(
    documentVersionIds: readonly string[],
  ): Promise<CurrentLegalDocument[]> {
    const current = await this.getCurrentDocuments();
    // 首次部署尚未发布法务文本时允许平台完成引导；任一文本发布后即严格闭合两份。
    if (current.length === 0) {
      return current;
    }
    if (current.length !== REQUIRED_DOCUMENT_TYPES.size) {
      throw new ProtocolConfigurationError();
    }

    const supplied = new Set(documentVersionIds);
    if (
      supplied.size !== current.length ||
      current.some((document) => !supplied.has(document.id))
    ) {
      throw new ProtocolConsentRequiredError();
    }
    return current;
  }

  async recordCurrentConsents(
    accountId: string,
    documentVersionIds: readonly string[],
    source: string,
    ipAddress?: string,
  ): Promise<void> {
    const current = await this.assertCurrentDocumentIds(documentVersionIds);
    if (current.length === 0) {
      return;
    }

    await this.prisma.protocolConsent.createMany({
      data: current.map((document) => ({
        accountId,
        documentVersionId: document.id,
        source,
        ipAddress,
      })),
      skipDuplicates: true,
    });
  }

}

function normalizeCurrentDocuments(
  documents: LegalDocumentVersion[],
): CurrentLegalDocument[] {
  const types = new Set(documents.map((document) => document.type));
  if (
    documents.length > 0 &&
    (types.size !== REQUIRED_DOCUMENT_TYPES.size ||
      [...REQUIRED_DOCUMENT_TYPES].some((type) => !types.has(type)))
  ) {
    throw new ProtocolConfigurationError();
  }

  return documents.map((document) => {
    if (!document.publishedAt) {
      throw new ProtocolConfigurationError();
    }
    return {
      id: document.id,
      type: document.type,
      version: document.version,
      content: document.content,
      contentHash: document.contentHash,
      publishedAt: document.publishedAt,
    };
  });
}
