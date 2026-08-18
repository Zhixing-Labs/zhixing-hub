import { Inject, Injectable } from '@nestjs/common';
import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { RedisService } from '../../../infrastructure/redis/redis.service';
import {
  CAPTCHA_ADAPTER,
  CaptchaAdapter,
  SMS_ADAPTER,
  SmsAdapter,
  SmsCodePurpose,
  SmsDelivery,
} from '../../integration/integration.adapters';

const CODE_TTL_SECONDS = 5 * 60;
const MAX_CODE_ATTEMPTS = 5;

const CLAIM_SEND_SLOT_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 1 then
  return 1
end
redis.call('ZREMRANGEBYSCORE', KEYS[2], 0, ARGV[1] - 3600000)
if redis.call('ZCARD', KEYS[2]) >= 5 then
  return 2
end
redis.call('SET', KEYS[1], '1', 'PX', 60000)
redis.call('ZADD', KEYS[2], ARGV[1], ARGV[2])
redis.call('PEXPIRE', KEYS[2], 3600000)
return 0
`;

export class InvalidCaptchaError extends Error {
  constructor() {
    super('CAPTCHA verification failed');
    this.name = 'InvalidCaptchaError';
  }
}

export class ActivationCodeRateLimitedError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super('Activation code request is rate limited');
    this.name = 'ActivationCodeRateLimitedError';
  }
}

@Injectable()
export class ActivationCodeService {
  constructor(
    private readonly redis: RedisService,
    @Inject(CAPTCHA_ADAPTER) private readonly captcha: CaptchaAdapter,
    @Inject(SMS_ADAPTER) private readonly sms: SmsAdapter,
  ) {}

  issueCaptchaChallenge() {
    return this.captcha.issueChallenge();
  }

  async issueActivationCode(
    phone: string,
    captchaToken: string,
  ): Promise<SmsDelivery> {
    return this.issueCode(phone, captchaToken, 'ACTIVATION');
  }

  async issueLoginCode(
    phone: string,
    captchaToken: string,
  ): Promise<SmsDelivery> {
    return this.issueCode(phone, captchaToken, 'LOGIN');
  }

  async issueRegistrationCode(
    phone: string,
    captchaToken: string,
  ): Promise<SmsDelivery> {
    return this.issueCode(phone, captchaToken, 'REGISTRATION');
  }

  async issuePhoneChangeOldCode(
    phone: string,
    captchaToken: string,
  ): Promise<SmsDelivery> {
    return this.issueCode(phone, captchaToken, 'PHONE_CHANGE_OLD');
  }

  async issuePhoneChangeNewCode(
    phone: string,
    captchaToken: string,
  ): Promise<SmsDelivery> {
    return this.issueCode(phone, captchaToken, 'PHONE_CHANGE_NEW');
  }

  async issueCode(
    phone: string,
    captchaToken: string,
    purpose: SmsCodePurpose,
  ): Promise<SmsDelivery> {
    if (!(await this.captcha.verify(captchaToken))) {
      throw new InvalidCaptchaError();
    }

    const redis = await this.redis.connection();
    const now = Date.now();
    const result = Number(
      await redis.eval(
        CLAIM_SEND_SLOT_SCRIPT,
        2,
        cooldownKey(phone),
        hourlyKey(phone),
        now,
        `${now}-${randomUUID()}`,
      ),
    );
    if (result === 1) {
      throw new ActivationCodeRateLimitedError(60);
    }
    if (result === 2) {
      throw new ActivationCodeRateLimitedError(60 * 60);
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await redis
      .multi()
      .hset(
        codeKey(phone, purpose),
        'hash',
        hashCode(phone, code, purpose),
        'attempts',
        '0',
      )
      .expire(codeKey(phone, purpose), CODE_TTL_SECONDS)
      .exec();
    return this.sms.sendCode(phone, code, purpose);
  }

  async consumeActivationCode(phone: string, code: string): Promise<boolean> {
    return this.consumeCode(phone, code, 'ACTIVATION');
  }

  async consumeLoginCode(phone: string, code: string): Promise<boolean> {
    return this.consumeCode(phone, code, 'LOGIN');
  }

  async consumeRegistrationCode(
    phone: string,
    code: string,
  ): Promise<boolean> {
    return this.consumeCode(phone, code, 'REGISTRATION');
  }

  async consumePhoneChangeOldCode(
    phone: string,
    code: string,
  ): Promise<boolean> {
    return this.consumeCode(phone, code, 'PHONE_CHANGE_OLD');
  }

  async consumePhoneChangeNewCode(
    phone: string,
    code: string,
  ): Promise<boolean> {
    return this.consumeCode(phone, code, 'PHONE_CHANGE_NEW');
  }

  async consumeCode(
    phone: string,
    code: string,
    purpose: SmsCodePurpose,
  ): Promise<boolean> {
    const redis = await this.redis.connection();
    const key = codeKey(phone, purpose);
    const record = await redis.hgetall(key);
    if (!record.hash) {
      return false;
    }

    const expected = Buffer.from(record.hash, 'hex');
    const actual = Buffer.from(hashCode(phone, code, purpose), 'hex');
    const valid =
      expected.length === actual.length && timingSafeEqual(expected, actual);
    if (valid) {
      await redis.del(key);
      return true;
    }

    const attempts = await redis.hincrby(key, 'attempts', 1);
    if (attempts >= MAX_CODE_ATTEMPTS) {
      await redis.del(key);
    }
    return false;
  }
}

function codeKey(phone: string, purpose: SmsCodePurpose): string {
  return `identity:${purpose.toLowerCase()}:code:${phone}`;
}

function cooldownKey(phone: string): string {
  return `identity:activation:cooldown:${phone}`;
}

function hourlyKey(phone: string): string {
  return `identity:activation:hourly:${phone}`;
}

function hashCode(
  phone: string,
  code: string,
  purpose: SmsCodePurpose,
): string {
  const pepper =
    process.env.VERIFICATION_CODE_PEPPER?.trim() ||
    (process.env.NODE_ENV === 'production' ? '' : 'zhixing-dev-only-pepper');
  if (!pepper) {
    throw new Error('VERIFICATION_CODE_PEPPER is required in production');
  }
  return createHmac('sha256', pepper)
    .update(`${purpose}:${phone}:${code}`, 'utf8')
    .digest('hex');
}
