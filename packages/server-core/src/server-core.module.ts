import { Module } from '@nestjs/common';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { RequestContextModule } from './infrastructure/request-context/request-context.module';
import { IdentityModule } from './modules/identity/identity.module';
import { IntegrationModule } from './modules/integration/integration.module';
import { GovernanceModule } from './modules/governance/governance.module';
import { OrganizationModule } from './modules/organization/organization.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    RequestContextModule,
    IntegrationModule,
    GovernanceModule,
    IdentityModule,
    OrganizationModule,
  ],
  exports: [
    PrismaModule,
    RedisModule,
    RequestContextModule,
    IntegrationModule,
    GovernanceModule,
    IdentityModule,
    OrganizationModule,
  ],
})
export class ServerCoreModule {}
