import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { RequestContextModule } from '../../infrastructure/request-context/request-context.module';
import { LegalDocumentGovernanceService } from './legal-document-governance.service';

@Module({
  imports: [PrismaModule, RequestContextModule],
  providers: [LegalDocumentGovernanceService],
  exports: [LegalDocumentGovernanceService],
})
export class GovernanceModule {}
