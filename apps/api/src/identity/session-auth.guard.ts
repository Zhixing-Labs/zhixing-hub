import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AuthenticatedAccount,
  IdentityService,
  RequestContextService,
} from '@zhixing/server-core';
import { readSessionToken } from './session-cookie';

export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  auth?: AuthenticatedAccount;
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(RequestContextService)
    private readonly requestContext: RequestContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const cookie = request.headers.cookie;
    const cookieHeader = Array.isArray(cookie) ? cookie[0] : cookie;
    const token = readSessionToken(cookieHeader);
    const account = token ? await this.identity.resolveSession(token) : null;

    if (!account) {
      throw new UnauthorizedException('Session is missing, expired, or revoked');
    }

    request.auth = account;
    this.requestContext.setAuthentication({
      actorAccountId: account.accountId,
      tenantId: account.tenantId,
      role: account.role,
    });
    return true;
  }
}
