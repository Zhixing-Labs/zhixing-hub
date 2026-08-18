import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private client: Redis | null = null;
  private connecting: Promise<void> | null = null;

  async connection(): Promise<Redis> {
    if (!this.client) {
      const url = process.env.REDIS_URL?.trim() || 'redis://localhost:6379';
      this.client = new Redis(url, {
        enableOfflineQueue: false,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      });
      // ioredis 的 error 事件若无人监听会产生未处理事件；业务调用仍会收到 reject。
      this.client.on('error', () => undefined);
    }

    if (this.client.status === 'wait') {
      this.connecting ??= this.client.connect().finally(() => {
        this.connecting = null;
      });
      await this.connecting;
    }
    return this.client;
  }

  async isReady(): Promise<boolean> {
    try {
      return (await (await this.connection()).ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client && this.client.status !== 'end') {
      await this.client.quit().catch(() => this.client?.disconnect());
    }
  }
}
