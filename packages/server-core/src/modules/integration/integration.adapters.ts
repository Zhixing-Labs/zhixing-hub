export const CAPTCHA_ADAPTER = Symbol('CAPTCHA_ADAPTER');
export const SMS_ADAPTER = Symbol('SMS_ADAPTER');

export interface CaptchaChallenge {
  token: string;
  mock: boolean;
}

export interface CaptchaAdapter {
  issueChallenge(): Promise<CaptchaChallenge>;
  verify(token: string): Promise<boolean>;
}

export interface SmsDelivery {
  messageId: string;
  mock: boolean;
  debugCode?: string;
}

export type SmsCodePurpose = 'ACTIVATION' | 'LOGIN';

export interface SmsAdapter {
  sendCode(
    phone: string,
    code: string,
    purpose: SmsCodePurpose,
  ): Promise<SmsDelivery>;
}
