import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { RequestContextService } from '@zhixing/server-core';

interface HttpRequestLike {
  originalUrl?: string;
  url?: string;
}

interface HttpResponseLike {
  status(code: number): HttpResponseLike;
  json(body: unknown): void;
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  constructor(private readonly requestContext: RequestContextService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<HttpRequestLike>();
    const response = http.getResponse<HttpResponseLike>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const detail = readDetail(exception, status);

    if (!(exception instanceof HttpException)) {
      this.logger.error(
        exception instanceof Error ? exception.message : 'Unknown error',
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json({
      type: `https://zhixing.dev/problems/http-${status}`,
      title: HttpStatus[status] ?? 'Error',
      status,
      detail,
      instance: request.originalUrl ?? request.url,
      requestId: this.requestContext.current()?.requestId,
    });
  }
}

function readDetail(exception: unknown, status: number): string {
  if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
    return 'An unexpected error occurred';
  }

  if (!(exception instanceof HttpException)) {
    return 'Request failed';
  }

  const response = exception.getResponse();
  if (typeof response === 'string') {
    return response;
  }

  if (
    typeof response === 'object' &&
    response !== null &&
    'message' in response
  ) {
    const message = response.message;
    return Array.isArray(message) ? message.join('; ') : String(message);
  }

  return exception.message;
}
