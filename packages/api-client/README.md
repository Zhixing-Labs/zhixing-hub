# @zhixing/api-client

由 NestJS DTO 生成的 OpenAPI 契约自动生成，Web 统一消费本客户端，**禁止手写后端 DTO 镜像**（《11》第 4、5.1 节）。

- `openapi.json` 由 `apps/api` 的 NestJS 元数据导出；
- `src/` 由 `@hey-api/openapi-ts` 生成，禁止手工编辑；
- 仓库根执行 `pnpm openapi:generate` 可重建契约与客户端；
- 提交前应执行生成命令并确认产物无非预期差异。
