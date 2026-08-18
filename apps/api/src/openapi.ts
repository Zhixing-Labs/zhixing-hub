import { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  OpenAPIObject,
  SwaggerModule,
} from '@nestjs/swagger';

export function createOpenApiDocument(
  app: INestApplication,
): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Zhixing Hub API')
    .setDescription('知行工坊模块化单体业务接口')
    .setVersion('1.0')
    .addCookieAuth('zhixing_session', undefined, 'cookie')
    .build();

  return SwaggerModule.createDocument(app, config);
}
