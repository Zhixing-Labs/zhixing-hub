import { describe, expect, it } from 'vitest';
import { ROUTE_PARTITIONS, STUDENT_LIFECYCLE_STATES, USER_ENDPOINTS } from './index';

describe('共享常量', () => {
  it('五端齐备（《07》第 1 节）', () => {
    expect(USER_ENDPOINTS).toHaveLength(5);
  });

  it('学员生命周期五态齐备（《07》第 4.2 节）', () => {
    expect(STUDENT_LIFECYCLE_STATES).toHaveLength(5);
  });

  it('路由分区覆盖公共、认证、验证、五端与规范中心（《11》第 4.1 节）', () => {
    expect(ROUTE_PARTITIONS).toHaveLength(9);
  });
});
