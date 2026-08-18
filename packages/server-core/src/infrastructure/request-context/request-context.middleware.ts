import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { RequestContextService } from './request-context.service';

interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
}

interface ResponseLike {
  setHeader(name: string, value: string): void;
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly context: RequestContextService) {}

  use(request: RequestLike, response: ResponseLike, next: () => void): void {
    const incoming = request.headers['x-request-id'];
    const requestId =
      (Array.isArray(incoming) ? incoming[0] : incoming)?.trim() || randomUUID();

    response.setHeader('x-request-id', requestId);
    this.context.run({ requestId }, next);
  }
}
