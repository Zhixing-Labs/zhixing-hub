import { Injectable } from '@nestjs/common';
import {
  generateSecret,
  generateURI,
  verify as verifyTotp,
} from 'otplib';

const TOTP_ISSUER = 'Zhixing Hub';

export interface TotpEnrollment {
  secret: string;
  uri: string;
}

@Injectable()
export class TotpService {
  createEnrollment(username: string): TotpEnrollment {
    const secret = generateSecret({ length: 20 });
    return {
      secret,
      uri: generateURI({
        issuer: TOTP_ISSUER,
        label: username,
        secret,
      }),
    };
  }

  async verify(
    secret: string,
    token: string,
    afterTimeStep?: number,
  ): Promise<number | null> {
    if (!/^\d{6}$/.test(token)) {
      return null;
    }

    const result = await verifyTotp({
      secret,
      token,
      epochTolerance: [30, 0],
      afterTimeStep,
    });
    return result.valid && 'timeStep' in result ? result.timeStep : null;
  }
}
