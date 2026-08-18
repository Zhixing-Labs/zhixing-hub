// 成长激励层规则常量（Q13 / R13）——规则唯一定义处为《04》第 4.13 节与《02》第 14 节。
// 本文件是规则的可执行表达：演示页与后端 Evidence 阶段的真实派生共用同一套函数与常量。

/** 声明强度档（《02》第 2 节 claims 字段的三档） */
export type ClaimStrength = 'strong' | 'medium' | 'weak';

/** 星点表 v1（《02》第 14 节）：有效声明按当前强度档计点 */
export const STAR_POINTS: Readonly<Record<ClaimStrength, number>> = {
  strong: 10,
  medium: 4,
  weak: 1,
} as const;

/** 星级阈值 v1：下标 0 → 1★ … 4 → 5★；递增间隔抑制刷量的边际收益 */
export const STAR_THRESHOLDS: readonly [number, number, number, number, number] = [
  10, 25, 50, 90, 150,
] as const;

export type StarLevel = 0 | 1 | 2 | 3 | 4 | 5;

/** 星点 → 星级（整数星，不做半星） */
export function starLevel(points: number): StarLevel {
  let level: StarLevel = 0;
  for (const threshold of STAR_THRESHOLDS) {
    if (points >= threshold) level = (level + 1) as StarLevel;
  }
  return level;
}

/** 距下一星：不足 5★ 时返回目标星级与还差的星点数；已满 5★ 返回 null */
export function pointsToNextStar(
  points: number,
): { next: Exclude<StarLevel, 0>; remaining: number } | null {
  for (let i = 0; i < STAR_THRESHOLDS.length; i += 1) {
    const threshold = STAR_THRESHOLDS[i]!;
    if (points < threshold) {
      return { next: (i + 1) as Exclude<StarLevel, 0>, remaining: threshold - points };
    }
  }
  return null;
}

/** 条目星点输入（演示页与派生管道的最小声明视图） */
export interface StarClaimInput {
  envelopeId: string;
  entryId: string;
  strength: ClaimStrength;
}

/**
 * 条目星点：同一信封对同一条目至多一条声明计点（《02》第 14 节），
 * 多条时取点值最高的一条；输出为各信封有效声明点值之和。
 */
export function entryStarPoints(claims: readonly StarClaimInput[]): number {
  const bestByEnvelope = new Map<string, number>();
  for (const claim of claims) {
    const key = `${claim.envelopeId}::${claim.entryId}`;
    const points = STAR_POINTS[claim.strength];
    const prev = bestByEnvelope.get(key);
    if (prev === undefined || points > prev) bestByEnvelope.set(key, points);
  }
  let sum = 0;
  for (const points of bestByEnvelope.values()) sum += points;
  return sum;
}

// ---------------------------------------------------------------------------
// 成长时间线事件目录（封闭枚举 v1，《04》第 4.13 节）

export const GROWTH_EVENT_TYPES = [
  'E1',
  'E2',
  'E3',
  'E4',
  'E5',
  'E6',
  'E7',
  'E8',
] as const;
export type GrowthEventType = (typeof GROWTH_EVENT_TYPES)[number];

export interface GrowthEventMeta {
  label: string;
  /** true = 仅本人时间线渲染（E7 / E8） */
  selfOnly: boolean;
}

export const GROWTH_EVENT_CATALOG: Readonly<Record<GrowthEventType, GrowthEventMeta>> = {
  E1: { label: '证据过审', selfOnly: false },
  E2: { label: '证书发放', selfOnly: false },
  E3: { label: '结论升级', selfOnly: false },
  E4: { label: '经验厚度节点', selfOnly: false },
  E5: { label: '项目结项 / 共建结课', selfOnly: false },
  E6: { label: '活动参与开始', selfOnly: false },
  E7: { label: 'L0 观察', selfOnly: true },
  E8: { label: '中途退出', selfOnly: true },
} as const;

// ---------------------------------------------------------------------------
// 勋章目录 v1（Q13：纯事实里程碑、仅本人可见，《04》第 4.13 节）

export type BadgeSeries = 'departure' | 'accumulation' | 'depth';

export const BADGE_SERIES_LABELS: Readonly<Record<BadgeSeries, string>> = {
  departure: '启程',
  accumulation: '积累',
  depth: '深耕',
} as const;

export interface BadgeDefinition {
  id: string;
  series: BadgeSeries;
  title: string;
  /** 达成条件的一句话事实描述（界面原样展示） */
  condition: string;
  /** 达成所需的事实计数里程碑（1 = 首次型） */
  milestone: number;
}

export const BADGE_CATALOG_V1: readonly BadgeDefinition[] = [
  // 启程系列
  { id: 'first-evidence', series: 'departure', title: '启程', condition: '首份过审证据入库', milestone: 1 },
  { id: 'first-project', series: 'departure', title: '首个战场', condition: '首个平台项目结项', milestone: 1 },
  { id: 'first-certificate', series: 'departure', title: '第一张证书', condition: '首张结项证书', milestone: 1 },
  { id: 'lightup-d1', series: 'departure', title: '点亮 D1', condition: 'D1 知识与学习存在 ≥1 条 L1+ 结论', milestone: 1 },
  { id: 'lightup-d2', series: 'departure', title: '点亮 D2', condition: 'D2 问题解决与设计存在 ≥1 条 L1+ 结论', milestone: 1 },
  { id: 'lightup-d3', series: 'departure', title: '点亮 D3', condition: 'D3 执行与交付存在 ≥1 条 L1+ 结论', milestone: 1 },
  { id: 'lightup-d4', series: 'departure', title: '点亮 D4', condition: 'D4 沟通与协作存在 ≥1 条 L1+ 结论', milestone: 1 },
  { id: 'lightup-d5', series: 'departure', title: '点亮 D5', condition: 'D5 职业素养存在 ≥1 条 L1+ 结论', milestone: 1 },
  { id: 'all-dimensions', series: 'departure', title: '五维全开', condition: '五个维度各存在 ≥1 条 L1+ 结论', milestone: 5 },
  // 积累系列
  { id: 'projects-3', series: 'accumulation', title: '三度结项', condition: '平台项目结项 3 个', milestone: 3 },
  { id: 'projects-5', series: 'accumulation', title: '五度结项', condition: '平台项目结项 5 个', milestone: 5 },
  { id: 'first-competition', series: 'accumulation', title: '竞赛首证', condition: 'B 类竞赛证据首次过审', milestone: 1 },
  { id: 'first-academic', series: 'accumulation', title: '学术首证', condition: 'C 类学术成果证据首次过审', milestone: 1 },
  { id: 'first-certification', series: 'accumulation', title: '认证首证', condition: 'F 类职业认证证据首次过审', milestone: 1 },
  // 深耕系列
  { id: 'native-1', series: 'depth', title: '原生初耕', condition: '平台原生证据信封 1 封', milestone: 1 },
  { id: 'native-3', series: 'depth', title: '原生深耕', condition: '平台原生证据信封 3 封', milestone: 3 },
  { id: 'native-6', series: 'depth', title: '原生主理', condition: '平台原生证据信封 6 封', milestone: 6 },
  { id: 'thickness-12', series: 'depth', title: '厚度一年', condition: '任一累积增值条目经验厚度达 12 个月', milestone: 12 },
  { id: 'thickness-24', series: 'depth', title: '厚度两年', condition: '任一累积增值条目经验厚度达 24 个月', milestone: 24 },
] as const;

// ---------------------------------------------------------------------------
// 活跃热力图口径 v1（《04》第 4.13 节、《06》第 3 节冻结初值）

/** 热力图时间窗（月） */
export const HEATMAP_WINDOW_MONTHS = 12;
/** 色阶档数（0 档 = 无动作不显色，另 5 档强度） */
export const HEATMAP_SCALE_LEVELS = 5;
/** 成长动作来源（封闭）：登录 / 浏览 / 讨论区发言不计 */
export const GROWTH_ACTION_SOURCES = [
  'task-submission', // 进行中项目的任务提交
  'evidence-accepted', // 过审证据（按 issued_at）
  'certificate-issued', // 证书发放
] as const;
export type GrowthActionSource = (typeof GROWTH_ACTION_SOURCES)[number];

// ---------------------------------------------------------------------------
// 覆盖率雷达口径（《04》第 4.13 节、R13）：轴 = 对目标岗位族标准的覆盖 n/m

export type DimensionCode = 'D1' | 'D2' | 'D3' | 'D4' | 'D5';

export interface DimensionCoverage {
  dimension: DimensionCode;
  label: string;
  /** 已满足条数（结论等级 ≥ 要求等级，二值口径，《02》第 9 节） */
  satisfied: number;
  /** 该维标准要求条目总数 */
  total: number;
}

/** 覆盖率百分数（整数，供环 / 雷达轴展示；须可展开为条目清单） */
export function coveragePercent(coverage: DimensionCoverage): number {
  if (coverage.total <= 0) return 0;
  return Math.round((coverage.satisfied / coverage.total) * 100);
}
