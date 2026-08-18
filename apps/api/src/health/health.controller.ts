import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService, RedisService } from '@zhixing/server-core';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RedisService) private readonly redis: RedisService,
  ) {}

  @Get('live')
  live(): { status: string } {
    return { status: 'ok' };
  }

  // MinIO 随 File 模块加入同一检查。
  @Get('ready')
  async ready(): Promise<{
    status: string;
    checks: { postgres: string; redis: string };
  }> {
    const [postgres, redis] = await Promise.all([
      this.prisma.isReady(),
      this.redis.isReady(),
    ]);
    if (!postgres || !redis) {
      throw new ServiceUnavailableException(
        `Dependencies unavailable: ${[
          !postgres && 'PostgreSQL',
          !redis && 'Redis',
        ]
          .filter(Boolean)
          .join(', ')}`,
      );
    }
    return {
      status: 'ready',
      checks: { postgres: 'ok', redis: 'ok' },
    };
  }
}
