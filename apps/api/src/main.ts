import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { RequestContextService } from '@zhixing/server-core';
import { AppModule } from './app.module';
import { ProblemDetailsFilter } from './common/problem-details.filter';
import { createOpenApiDocument } from './openapi';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  // 业务接口统一 /api/v1 前缀（《11》第 5.1 节）；健康检查为运维端点，不进前缀
  app.setGlobalPrefix('api/v1', { exclude: ['health/live', 'health/ready'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(
    new ProblemDetailsFilter(app.get(RequestContextService)),
  );
  app.enableShutdownHooks();

  if (process.env.NODE_ENV !== 'production') {
    const document = createOpenApiDocument(app);
    SwaggerModule.setup('api/v1/docs', app, document);
  }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`[api] listening on :${port}`);
}

void bootstrap();
