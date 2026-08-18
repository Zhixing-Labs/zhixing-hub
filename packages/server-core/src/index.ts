// 领域模块、应用服务、仓储与集成适配器（《11》第 4 节）。
// 业务模块按《11》第 4.3 节十二模块逐阶段启用：
// Identity / Organization / Ontology / Learning / Evidence / Talent /
// Content / Governance / Notification / File / Integration / Analytics。
// API 与 Worker 共用本包，仅启动入口不同。

export * from './infrastructure/prisma/prisma.module';
export * from './infrastructure/prisma/prisma.service';
export * from './infrastructure/redis/redis.module';
export * from './infrastructure/redis/redis.service';
export * from './infrastructure/request-context/request-context.module';
export * from './infrastructure/request-context/request-context.middleware';
export * from './infrastructure/request-context/request-context.service';
export * from './modules/identity/application/identity.service';
export * from './modules/identity/application/account-security.service';
export * from './modules/identity/application/counselor-student-security.service';
export * from './modules/identity/application/activation-code.service';
export * from './modules/identity/application/login-throttle.service';
export * from './modules/identity/application/platform-account-admin.service';
export * from './modules/identity/application/platform-account-enrollment.service';
export * from './modules/identity/application/protocol-consent.service';
export * from './modules/identity/application/sms-login.service';
export * from './modules/identity/application/user-account-activation.service';
export * from './modules/identity/domain/password-hasher';
export * from './modules/identity/domain/recovery-codes';
export * from './modules/identity/domain/session-token';
export * from './modules/identity/domain/totp-cipher';
export * from './modules/identity/domain/totp.service';
export * from './modules/identity/identity.module';
export * from './modules/integration/integration.adapters';
export * from './modules/integration/integration.module';
export * from './modules/integration/mock-integration.adapters';
export * from './modules/governance/governance.module';
export * from './modules/governance/legal-document-governance.service';
export * from './modules/organization/application/counselor-student-import.service';
export * from './modules/organization/application/organization-admin.service';
export * from './modules/organization/application/organization-query.service';
export * from './modules/organization/application/university-organization.service';
export * from './modules/organization/domain/student-csv';
export * from './modules/organization/domain/student-lifecycle';
export * from './modules/organization/organization.module';
export * from './server-core.module';

export const SERVER_CORE_INFO = {
  modules: [
    'Identity',
    'Organization',
    'Ontology',
    'Learning',
    'Evidence',
    'Talent',
    'Content',
    'Governance',
    'Notification',
    'File',
    'Integration',
    'Analytics',
  ] as const,
} as const;
