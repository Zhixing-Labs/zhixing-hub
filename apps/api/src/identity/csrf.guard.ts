import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { IdentityService } from '@zhixing/server-core';
import { AuthenticatedRequest } from './session-auth.guard';
import { readSessionToken } from './session-cookie';

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    @Inject(IdentityService) private readonly identity: IdentityService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const cookie = request.headers.cookie;
    const cookieHeader = Array.isArray(cookie) ? cookie[0] : cookie;
    const csrf = request.headers['x-csrf-token'];
    const csrfToken = Array.isArray(csrf) ? csrf[0] : csrf;
    const sessionToken = readSessionToken(cookieHeader);

    if (
      !sessionToken ||
      !csrfToken ||
      !(await this.identity.validateCsrfToken(sessionToken, csrfToken))
    ) {
      throw new ForbiddenException('Invalid CSRF token');
    }
    return true;
  }
}
