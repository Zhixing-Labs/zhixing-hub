import { describe, expect, it } from 'vitest';
import {
  MissingRequestContextError,
  RequestContextService,
} from './request-context.service';

describe('request context tenant scope（《11》第 7.2 节）', () => {
  it('在异步调用链中保留并补齐认证上下文', async () => {
    const context = new RequestContextService();

    await context.run({ requestId: 'request-1' }, async () => {
      await Promise.resolve();
      context.setAuthentication({
        actorAccountId: 'account-1',
        tenantId: 'tenant-1',
        role: 'STUDENT',
      });
      await Promise.resolve();

      expect(context.requireCurrent()).toMatchObject({
        requestId: 'request-1',
        actorAccountId: 'account-1',
        tenantId: 'tenant-1',
        role: 'STUDENT',
      });
      expect(context.requireTenantId()).toBe('tenant-1');
    });
  });

  it('拒绝在无请求上下文时读取租户', () => {
    const context = new RequestContextService();
    expect(() => context.requireTenantId()).toThrow(
      new MissingRequestContextError('request'),
    );
  });
});
