import { StudentLifecycleState } from '@prisma/client';

const ALLOWED_TRANSITIONS: Readonly<
  Record<StudentLifecycleState, readonly StudentLifecycleState[]>
> = {
  ENROLLED: ['GRADUATE_ACTIVE', 'SUSPENDED'],
  GRADUATE_ACTIVE: ['READ_ONLY'],
  READ_ONLY: [],
  SUSPENDED: ['ENROLLED'],
};

export class InvalidStudentLifecycleTransitionError extends Error {
  constructor(
    readonly from: StudentLifecycleState,
    readonly to: StudentLifecycleState,
  ) {
    super(`Student lifecycle transition ${from} -> ${to} is not allowed`);
    this.name = 'InvalidStudentLifecycleTransitionError';
  }
}

/**
 * 高校认证学员生命周期的唯一迁移表（《07》第 4.2 节）。
 * “学员入企”是主体转换，不混入本状态机。
 */
export function canTransitionStudentLifecycle(
  from: StudentLifecycleState,
  to: StudentLifecycleState,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertStudentLifecycleTransition(
  from: StudentLifecycleState,
  to: StudentLifecycleState,
): void {
  if (!canTransitionStudentLifecycle(from, to)) {
    throw new InvalidStudentLifecycleTransitionError(from, to);
  }
}
