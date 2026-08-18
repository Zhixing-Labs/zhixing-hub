import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

const MAX_CONSECUTIVE_FAILURES = 5;
const LOCK_MINUTES = 15;

export interface LoginThrottleState {
  id: string;
  failedLoginCount: number;
  lockedUntil: Date | null;
}

/** 登录连续失败 5 次锁定 15 分钟（《07》第 5.1 节、《06》第 3 节）。 */
@Injectable()
export class LoginThrottleService {
  constructor(private readonly prisma: PrismaService) {}

  async isLocked(account: LoginThrottleState): Promise<boolean> {
    if (!account.lockedUntil) {
      return false;
    }
    if (account.lockedUntil > new Date()) {
      return true;
    }

    await this.clear(account.id);
    return false;
  }

  async recordFailure(accountId: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "account"
      SET
        "failed_login_count" = "failed_login_count" + 1,
        "locked_until" = CASE
          WHEN "failed_login_count" + 1 >= ${MAX_CONSECUTIVE_FAILURES}
          THEN CURRENT_TIMESTAMP + (${LOCK_MINUTES} * INTERVAL '1 minute')
          ELSE "locked_until"
        END,
        "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${accountId}::uuid
    `;
  }

  async clear(accountId: string): Promise<void> {
    await this.prisma.account.updateMany({
      where: {
        id: accountId,
        OR: [
          { failedLoginCount: { gt: 0 } },
          { lockedUntil: { not: null } },
        ],
      },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
  }
}
