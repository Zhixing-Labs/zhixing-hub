// BullMQ Worker 启动入口：与 API 共用 @zhixing/server-core 领域模块与 Prisma Schema，
// 仅启动命令不同（同一镜像、不同启动入口，《11》第 3 节）。
// 四类队列（lifecycle / notification / document / compute，《11》第 10.2 节）
// 随业务模块逐阶段登记处理器；队列不是事实源，周期扫描由 PostgreSQL 对账兜底。

function shutdown(signal: string): void {
  console.log(`[worker] received ${signal}, exiting`);
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

console.log('[worker] entry ready; queues not registered yet');

// 占位保活：队列登记后由 BullMQ Worker 的事件循环接管
setInterval(() => {}, 1 << 30);
