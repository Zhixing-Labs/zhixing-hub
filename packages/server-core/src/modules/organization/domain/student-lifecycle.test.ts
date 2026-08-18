import { describe, expect, it } from 'vitest';
import {
  assertStudentLifecycleTransition,
  canTransitionStudentLifecycle,
  InvalidStudentLifecycleTransitionError,
} from './student-lifecycle';

describe('student lifecycle（《07》第 4.2 节）', () => {
  it('允许在读毕业或进入学籍停用态', () => {
    expect(canTransitionStudentLifecycle('ENROLLED', 'GRADUATE_ACTIVE')).toBe(
      true,
    );
    expect(canTransitionStudentLifecycle('ENROLLED', 'SUSPENDED')).toBe(true);
  });

  it('只允许学籍停用态恢复为在读', () => {
    expect(canTransitionStudentLifecycle('SUSPENDED', 'ENROLLED')).toBe(true);
    expect(
      canTransitionStudentLifecycle('SUSPENDED', 'GRADUATE_ACTIVE'),
    ).toBe(false);
  });

  it('毕业满两年后进入只读且不可回退', () => {
    expect(
      canTransitionStudentLifecycle('GRADUATE_ACTIVE', 'READ_ONLY'),
    ).toBe(true);
    expect(canTransitionStudentLifecycle('READ_ONLY', 'ENROLLED')).toBe(false);
  });

  it('非法迁移抛出带前后态的领域错误', () => {
    expect(() =>
      assertStudentLifecycleTransition('READ_ONLY', 'ENROLLED'),
    ).toThrow(
      new InvalidStudentLifecycleTransitionError('READ_ONLY', 'ENROLLED'),
    );
  });
});
