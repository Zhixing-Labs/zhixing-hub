// 极少量纯常量与纯类型（《11》第 4 节）；不接纳有业务归属的"万能工具"。

export * from './growth';


/** 五端用户（《07》第 1 节）：平台、学员、高校、企业、政务 */
export const USER_ENDPOINTS = [
  'platform',
  'student',
  'university',
  'enterprise',
  'government',
] as const;
export type UserEndpoint = (typeof USER_ENDPOINTS)[number];

/** 高校认证学员生命周期状态机（《07》第 4.2 节） */
export const STUDENT_LIFECYCLE_STATES = [
  'enrolled', // 在读
  'graduate_active', // 毕业活跃态（2 年）
  'read_only', // 纯只读态
  'enterprise_member', // 企业成员态
  'suspended', // 学籍停用态
] as const;
export type StudentLifecycleState = (typeof STUDENT_LIFECYCLE_STATES)[number];

/** Web 路由分区（《11》第 4.1 节）：公共 / 认证 / 验证 / 五端工作台 / 规范中心 */
export const ROUTE_PARTITIONS = [
  '/',
  '/auth',
  '/verify',
  '/platform',
  '/student',
  '/university',
  '/enterprise',
  '/government',
  '/docs',
] as const;
export type RoutePartition = (typeof ROUTE_PARTITIONS)[number];
