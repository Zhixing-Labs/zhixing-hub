import { Injectable } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContextValue {
  requestId: string;
  actorAccountId?: string;
  tenantId?: string;
  role?: MembershipRole;
}

export class MissingRequestContextError extends Error {
  constructor(field: 'request' | 'tenant') {
    super(`Missing ${field} context`);
    this.name = 'MissingRequestContextError';
  }
}

/**
 * API 与 Worker 共用的调用上下文。租户仓储只能从这里取得当前 tenantId，
 * 不接受 Controller 任意传入租户以绕过隔离（《11》第 7.2 节）。
 */
@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<
    Readonly<RequestContextValue>
  >();

  run<T>(value: RequestContextValue, callback: () => T): T {
    return this.storage.run(Object.freeze({ ...value }), callback);
  }

  setAuthentication(
    value: Pick<RequestContextValue, 'actorAccountId' | 'tenantId' | 'role'>,
  ): void {
    const current = this.requireCurrent();
    this.storage.enterWith(Object.freeze({ ...current, ...value }));
  }

  current(): Readonly<RequestContextValue> | undefined {
    return this.storage.getStore();
  }

  requireCurrent(): Readonly<RequestContextValue> {
    const value = this.current();
    if (!value) {
      throw new MissingRequestContextError('request');
    }
    return value;
  }

  requireTenantId(): string {
    const tenantId = this.requireCurrent().tenantId;
    if (!tenantId) {
      throw new MissingRequestContextError('tenant');
    }
    return tenantId;
  }
}
