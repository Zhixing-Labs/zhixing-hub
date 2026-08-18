# 开发环境快速上手

技术栈与边界以《docs/11-技术架构.md》为准，本文件只讲日常操作。

## 前置

- Node ≥ 22.12、pnpm ≥ 11（`npm i -g pnpm`）、Docker（跑本地 PG / Redis / MinIO）
- pnpm 构建脚本白名单已配置于 `pnpm-workspace.yaml`（`allowBuilds`），新增含安装脚本的依赖时在此登记

## 首次启动

```bash
pnpm install                 # 安装全部 workspace 依赖
docker compose -f deploy/docker-compose.yml up -d   # 本地数据服务（PG 5432 / Redis 6379 / MinIO 9000-9001）
cp .env.example .env         # Windows PowerShell 可用：Copy-Item .env.example .env
pnpm prisma:migrate:deploy   # 应用已提交迁移
pnpm prisma:generate         # 生成 Prisma Client（schema 变更后重跑）
pnpm bootstrap:super-admin   # 仅首次部署；先在 .env 填写超管与 TOTP 引导变量
pnpm bootstrap:public-academy # 预置知行公开学院：行政区划首批种子 + 按地级市建校区学院（幂等，可重复执行）
```

## 日常命令

```bash
pnpm dev:web                 # Vite 开发服务器 :5173（/api 代理到 :3000）
pnpm dev:api                 # NestJS API 热重载 :3000
pnpm dev:worker              # Worker 入口（队列随模块登记）
pnpm typecheck               # 全 workspace tsc / vue-tsc
pnpm build                   # 全 workspace 构建
pnpm test                    # Vitest
pnpm --filter @zhixing/server-core test:integration  # 需本地测试 PG / Redis
pnpm openapi:generate        # 导出 OpenAPI 并重建 packages/api-client
```

平台管理账号（超管 / 组织管理员 / 运营专员 / 平台看板）统一使用**唯一用户名 + 密码 + 强制 TOTP**，不绑定手机号、不走短信登录；用户端手机号入口与平台管理独立入口不得合并。

非超管平台账号由超管创建，初始密码仅在创建响应中展示一次；首次进入依次完成：校验初始密码 → 改密并绑定 TOTP → 明确确认恢复码已离线保存。最后一步完成前账号保持 `PENDING_ACTIVATION`，不会签发正式会话。

接口路径与字段以 `pnpm openapi:generate` 产物为准（`packages/api-client/openapi.json`，开发环境 `/api/v1/docs`）；表结构以 `prisma/schema.prisma` 为准。不要另写一份会过期的接口 / 表清单，决策与不变量写在《11》第 5.3、6.6、8 节。

当前短信与 CAPTCHA 按《11》第 13.1 节使用 Mock 适配器：开发环境的短信响应包含 `debugCode`，不发送真实短信；`NODE_ENV=production` 时 Mock 调用会被强制拒绝。验证码仅以加盐哈希存入 Redis，5 分钟失效，同手机号 60 秒间隔且滚动 1 小时最多 5 次。

密码登录、短信登录、用户激活与平台账号最终激活均提交当前用户协议 / 隐私政策版本 ID；版本发布不即时踢掉既有会话，用户在会话自然到期、退出或被撤销后的下一次登录重新确认。首次部署尚无已发布法务文本时允许完成平台引导，但一旦开始发布，两类文本必须同时具备完整的 `PUBLISHED` 版本。

## 结构速览

- `apps/web` Vue 3 SPA（九个路由分区：公共 / 认证 / 验证 / 五端 / 规范中心）
- `apps/api` NestJS HTTP 装配（业务规则不放这里）；`apps/worker` BullMQ 入口——两者共用 `packages/server-core`
- `packages/server-core` 领域模块、应用服务、仓储与集成适配器（《11》第 4.3 节十二模块在此落位）
- `packages/shared` 极少量纯常量与纯类型；`packages/api-client` 由 OpenAPI 生成、禁止手写；Web 消费该客户端，在对应《09》页面开工前不要提前接入
- `prisma/schema.prisma` 唯一结构化事实源；根持有 prisma CLI 与 @prisma/client，server-core 保留同版本依赖供 import（pnpm 同版本共享 store）
- `deploy/` 开发 Compose、OpenResty 配置与运维脚本

## 环境变量

数据库等连接串经环境变量注入（`DATABASE_URL` 等），不提交仓库；首批变量与本地安全说明见根目录 `.env.example`。
