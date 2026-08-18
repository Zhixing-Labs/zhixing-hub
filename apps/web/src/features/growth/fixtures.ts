// 成长时间线演示数据（Q13 / R13）——虚构学员「林晓」，确定性生成、无随机漂移。
// 真实数据随证据模块（《11》19.1 第 4 阶段）接入；本文件仅服务演示页。
import type {
  ClaimStrength,
  DimensionCoverage,
  GrowthEventType,
  StarClaimInput,
} from '@zhixing/shared';

export const DEMO_STUDENT = {
  name: '林晓',
  grade: '2023 级 · 网络空间安全学院',
  target: '主目标：网络安全岗位族标准 v1（已发布）',
  note: '演示数据——真实成长数据随证据模块接入',
} as const;

/** 演示时间窗：近 12 个月 */
export const DEMO_WINDOW = { start: '2025-08-19', end: '2026-08-18' } as const;

// ---------------------------------------------------------------------------
// 声明（最小视图）——星级由 @zhixing/shared 的规则函数现算，不在数据里写死

export interface DemoClaim extends StarClaimInput {
  entryName: string;
  dimension: string;
  issuedAt: string;
  source: string;
}

export const DEMO_CLAIMS: DemoClaim[] = [
  // C-0031 渗透测试：强×2 + 中×2 = 28 → 2★
  { envelopeId: 'ev-101', entryId: 'C-0031', strength: 'strong', entryName: '渗透测试', dimension: 'D1', issuedAt: '2025-12-20', source: '平台实训结项 · 日志安全审计实训' },
  { envelopeId: 'ev-102', entryId: 'C-0031', strength: 'strong', entryName: '渗透测试', dimension: 'D1', issuedAt: '2026-07-10', source: '共建课程结课 · 内网渗透检测' },
  { envelopeId: 'ev-201', entryId: 'C-0031', strength: 'medium', entryName: '渗透测试', dimension: 'D1', issuedAt: '2025-11-08', source: '竞赛字典 · 数模省一' },
  { envelopeId: 'ev-301', entryId: 'C-0031', strength: 'medium', entryName: '渗透测试', dimension: 'D1', issuedAt: '2026-04-20', source: '认证字典 · CISP-PTE' },
  // D2-C1 需求理解与问题分析：强×2 + 中×1 = 24 → 1★（差 1 点到 2★）
  { envelopeId: 'ev-101', entryId: 'D2-C1', strength: 'strong', entryName: '需求理解与问题分析', dimension: 'D2', issuedAt: '2025-12-20', source: '平台实训结项' },
  { envelopeId: 'ev-102', entryId: 'D2-C1', strength: 'strong', entryName: '需求理解与问题分析', dimension: 'D2', issuedAt: '2026-07-10', source: '共建课程结课' },
  { envelopeId: 'ev-201', entryId: 'D2-C1', strength: 'medium', entryName: '需求理解与问题分析', dimension: 'D2', issuedAt: '2025-11-08', source: '竞赛字典 · 数模省一' },
  // D3-C2 系统实现与集成：强×2 = 20 → 1★
  { envelopeId: 'ev-101', entryId: 'D3-C2', strength: 'strong', entryName: '系统实现与集成', dimension: 'D3', issuedAt: '2025-12-20', source: '平台实训结项' },
  { envelopeId: 'ev-102', entryId: 'D3-C2', strength: 'strong', entryName: '系统实现与集成', dimension: 'D3', issuedAt: '2026-07-10', source: '共建课程结课' },
  // D3-C4 成果交付与文档：强 + 中 = 14 → 1★
  { envelopeId: 'ev-101', entryId: 'D3-C4', strength: 'strong', entryName: '成果交付与文档', dimension: 'D3', issuedAt: '2025-12-20', source: '平台实训结项' },
  { envelopeId: 'ev-102', entryId: 'D3-C4', strength: 'medium', entryName: '成果交付与文档', dimension: 'D3', issuedAt: '2026-07-10', source: '共建课程结课' },
  // D4-C2 团队协作：中×2 = 8 → 0★（不展示星形，仅星点构成入口）
  { envelopeId: 'ev-101', entryId: 'D4-C2', strength: 'medium', entryName: '团队协作', dimension: 'D4', issuedAt: '2025-12-20', source: '平台实训结项' },
  { envelopeId: 'ev-102', entryId: 'D4-C2', strength: 'medium', entryName: '团队协作', dimension: 'D4', issuedAt: '2026-07-10', source: '共建课程结课' },
  // D5-C1 责任心与主动性：中×1 = 4
  { envelopeId: 'ev-101', entryId: 'D5-C1', strength: 'medium', entryName: '责任心与主动性', dimension: 'D5', issuedAt: '2025-12-20', source: '平台实训结项' },
  // C-0088 系统运维（累积增值条目）：中×3 = 12 → 1★，厚度 13 个月
  { envelopeId: 'ev-090', entryId: 'C-0088', strength: 'medium', entryName: '系统运维（累积增值）', dimension: 'D1', issuedAt: '2025-06-10', source: '实验室项目 · 导师背书' },
  { envelopeId: 'ev-101', entryId: 'C-0088', strength: 'medium', entryName: '系统运维（累积增值）', dimension: 'D1', issuedAt: '2025-12-20', source: '平台实训结项' },
  { envelopeId: 'ev-102', entryId: 'C-0088', strength: 'medium', entryName: '系统运维（累积增值）', dimension: 'D1', issuedAt: '2026-07-10', source: '共建课程结课' },
  // C-0117 数据分类分级：中×1 = 4
  { envelopeId: 'ev-201', entryId: 'C-0117', strength: 'medium', entryName: '数据分类分级', dimension: 'D1', issuedAt: '2025-11-08', source: '竞赛字典 · 数模省一' },
  // D2-C4 探索与创新：弱×1 = 1
  { envelopeId: 'ev-201', entryId: 'D2-C4', strength: 'weak', entryName: '探索与创新', dimension: 'D2', issuedAt: '2025-11-08', source: '竞赛字典 · 数模省一' },
  // D4-C1 表达与呈现：弱×1 = 1
  { envelopeId: 'ev-102', entryId: 'D4-C1', strength: 'weak', entryName: '表达与呈现', dimension: 'D4', issuedAt: '2026-07-10', source: '共建课程结课' },
  // E 类实习评价：D2-C3 工具与AI协作运用 中×1 = 4
  { envelopeId: 'ev-401', entryId: 'D2-C3', strength: 'medium', entryName: '工具与AI协作运用', dimension: 'D2', issuedAt: '2026-08-02', source: 'E 类实习评价 · 安全运营实习' },
];

/** 焦点条目（C25 星点堆叠条演示）：渗透测试 */
export const FOCUS_ENTRY = { entryId: 'C-0031', entryName: '渗透测试' } as const;

// ---------------------------------------------------------------------------
// 覆盖率雷达（对目标岗位族标准的覆盖 n/m，R13 唯一合法雷达口径）

export const DEMO_COVERAGE: DimensionCoverage[] = [
  { dimension: 'D1', label: 'D1 知识与学习', satisfied: 6, total: 12 },
  { dimension: 'D2', label: 'D2 问题解决', satisfied: 5, total: 10 },
  { dimension: 'D3', label: 'D3 执行与交付', satisfied: 4, total: 8 },
  { dimension: 'D4', label: 'D4 沟通与协作', satisfied: 2, total: 6 },
  { dimension: 'D5', label: 'D5 职业素养', satisfied: 1, total: 4 },
];

// ---------------------------------------------------------------------------
// 五维点亮与成长阶梯

export interface DemoDimensionRow {
  code: string;
  label: string;
  lit: boolean;
  counts: { l1: number; l2: number; l3: number; blank: number };
}

export const DEMO_DIMENSIONS: DemoDimensionRow[] = [
  { code: 'D1', label: '知识与学习', lit: true, counts: { l1: 4, l2: 2, l3: 1, blank: 5 } },
  { code: 'D2', label: '问题解决与设计', lit: true, counts: { l1: 3, l2: 2, l3: 0, blank: 5 } },
  { code: 'D3', label: '执行与交付', lit: true, counts: { l1: 3, l2: 1, l3: 0, blank: 4 } },
  { code: 'D4', label: '沟通与协作', lit: true, counts: { l1: 1, l2: 1, l3: 0, blank: 4 } },
  { code: 'D5', label: '职业素养', lit: false, counts: { l1: 0, l2: 0, l3: 0, blank: 6 } },
];

/** 每月 L1+ 条目数（阶梯图，step 渲染） */
export const DEMO_MONTHLY_L1PLUS: { month: string; count: number }[] = [
  { month: '25-09', count: 0 },
  { month: '25-10', count: 1 },
  { month: '25-11', count: 3 },
  { month: '25-12', count: 5 },
  { month: '26-01', count: 6 },
  { month: '26-02', count: 8 },
  { month: '26-03', count: 9 },
  { month: '26-04', count: 10 },
  { month: '26-05', count: 12 },
  { month: '26-06', count: 13 },
  { month: '26-07', count: 14 },
  { month: '26-08', count: 16 },
];

// ---------------------------------------------------------------------------
// 时间线事件（按日期倒序渲染；E7 / E8 仅本人）

export interface DemoTimelineEvent {
  id: string;
  type: GrowthEventType;
  date: string;
  title: string;
  detail: string;
  evidence?: string;
}

export const DEMO_TIMELINE: DemoTimelineEvent[] = [
  { id: 't-01', type: 'E1', date: '2026-08-02', title: '实习评价过审（E 类 · 安全运营实习）', detail: '实习时长 118 天 · 岗位相关 · 强度档中，声明 D2-C3 @L2', evidence: '证据信封 #ev-401' },
  { id: 't-02', type: 'E3', date: '2026-07-11', title: '渗透测试 L2 → L2（恢复确认）', detail: '共建课程结项观察聚合维持 L2，星点 +10', evidence: '声明 C-0031' },
  { id: 't-03', type: 'E5', date: '2026-07-10', title: '共建课程结课 · 内网渗透检测', detail: '项目周期 131 天，结项总评定稿完成', evidence: '项目档案' },
  { id: 't-04', type: 'E2', date: '2026-07-10', title: '结项证书 ZX-2026-0710-3847', detail: '证书完成即得，与评价声明解耦', evidence: '证书验证入口' },
  { id: 't-05', type: 'E1', date: '2026-04-20', title: '认证过审 · CISP-PTE', detail: '认证字典强度档中，声明 C-0031 @L1', evidence: '证据信封 #ev-301' },
  { id: 't-06', type: 'E7', date: '2026-06-05', title: 'L0 观察 · D5-C1 责任心与主动性', detail: '共建课程任务观察：参加但未达 L1 门槛——计入轨迹，不对外显示', evidence: '观察记录' },
  { id: 't-07', type: 'E4', date: '2026-03-10', title: '经验厚度 12 个月 · 系统运维', detail: '累积增值条目：最早证据 2025-03 至今跨度 12 个月、3 封信封', evidence: '条目 C-0088' },
  { id: 't-08', type: 'E6', date: '2026-03-02', title: '入项 · 内网渗透检测（共建课程）', detail: '名单导入 · 入项即授权（R3）', evidence: '项目档案' },
  { id: 't-09', type: 'E1', date: '2026-01-15', title: '课程成绩过审（A 类 · 5 门）', detail: '专业课成绩单核验，学期末取时 issued_at=2026-01-15', evidence: '证据信封 #ev-A1…A5' },
  { id: 't-10', type: 'E8', date: '2025-11-30', title: '中途退出 · 数据治理短项目', detail: '留痕不打标签；已落库观察按证据不可变保留、不聚合为声明', evidence: '档案事件流' },
  { id: 't-11', type: 'E3', date: '2025-12-21', title: '渗透测试 L1 → L2', detail: '平台实训观察聚合：≥2 任务观察 + 总评定稿，声明 @L2 · 强', evidence: '声明 C-0031' },
  { id: 't-12', type: 'E5', date: '2025-12-20', title: '平台项目结项 · 日志安全审计实训', detail: '项目周期 97 天，任务观察 14 个，总评定稿', evidence: '项目档案' },
  { id: 't-13', type: 'E2', date: '2025-12-20', title: '结项证书 ZX-2025-1208-1152', detail: '证书完成即得，与评价声明解耦', evidence: '证书验证入口' },
  { id: 't-14', type: 'E1', date: '2025-11-08', title: '竞赛过审 · 数学建模省一', detail: '竞赛字典强度档中，声明 C-0031 / C-0117 / D2-C1 / D2-C4', evidence: '证据信封 #ev-201' },
  { id: 't-15', type: 'E7', date: '2025-10-12', title: 'L0 观察 · D4-C2 团队协作', detail: '实训首个任务：参加了但未达 L1——后续任务已立 L1', evidence: '观察记录' },
  { id: 't-16', type: 'E6', date: '2025-09-15', title: '入项 · 日志安全审计实训（企业项目）', detail: '本院引入 · 直录制 · 支付占位成功', evidence: '项目档案' },
];

// ---------------------------------------------------------------------------
// 勋章（Q13：纯事实里程碑、仅本人可见）

/** 已获勋章：id → 达成日期 */
export const DEMO_BADGES_EARNED: Record<string, string> = {
  'first-evidence': '2025-11-08',
  'first-project': '2025-12-20',
  'first-certificate': '2025-12-20',
  'lightup-d1': '2025-12-21',
  'lightup-d2': '2025-12-21',
  'lightup-d3': '2025-12-21',
  'lightup-d4': '2026-01-16',
  'native-1': '2025-12-20',
  'first-competition': '2025-11-08',
  'first-certification': '2026-04-20',
  'thickness-12': '2026-03-10',
};

/** 未获勋章：id → 当前事实计数 */
export const DEMO_BADGES_PROGRESS: Record<string, number> = {
  'lightup-d5': 0,
  'all-dimensions': 4,
  'projects-3': 2,
  'projects-5': 2,
  'first-academic': 0,
  'native-3': 2,
  'native-6': 2,
  'thickness-24': 13,
};

// ---------------------------------------------------------------------------
// 证书精选（证面冻结字段，《07》第 3.5 节，不含任何能力等级）

export interface DemoCertificate {
  code: string;
  projectName: string;
  enterprise: string;
  college: string;
  period: string;
  issuedAt: string;
}

export const DEMO_CERTIFICATES: DemoCertificate[] = [
  {
    code: 'ZX-2026-0710-3847',
    projectName: '内网渗透检测（共建课程）',
    enterprise: '长风信息安全技术有限公司',
    college: '网络空间安全学院',
    period: '2026-03-02 ~ 2026-07-10',
    issuedAt: '2026-07-10',
  },
  {
    code: 'ZX-2025-1208-1152',
    projectName: '日志安全审计实训（企业项目）',
    enterprise: '长风信息安全技术有限公司',
    college: '网络空间安全学院',
    period: '2025-09-15 ~ 2025-12-20',
    issuedAt: '2025-12-20',
  },
];

// ---------------------------------------------------------------------------
// 活跃热力图（确定性生成：项目期密度 + 里程碑日尖峰）

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const PROJECT_PERIODS: { start: string; end: string }[] = [
  { start: '2025-09-15', end: '2025-12-20' },
  { start: '2026-03-02', end: '2026-07-10' },
];

const SPIKE_DAYS: Record<string, number> = {
  '2025-11-08': 4,
  '2025-12-20': 5,
  '2025-12-21': 3,
  '2026-01-15': 3,
  '2026-03-10': 2,
  '2026-04-20': 4,
  '2026-07-10': 5,
  '2026-08-02': 2,
};

function toDays(startIso: string, endIso: string): string[] {
  const days: string[] = [];
  const cursor = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function inPeriod(iso: string): boolean {
  return PROJECT_PERIODS.some((p) => iso >= p.start && iso <= p.end);
}

export const DEMO_HEATMAP: { date: string; count: number }[] = (() => {
  const rand = lcg(20260818);
  const spikes = { ...SPIKE_DAYS };
  return toDays(DEMO_WINDOW.start, DEMO_WINDOW.end).map((date) => {
    let count = 0;
    if (inPeriod(date)) {
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
      const density = weekday === 0 || weekday === 6 ? 0.3 : 0.85;
      if (rand() < density) count += 1 + Math.floor(rand() * 2);
    }
    const spike = spikes[date];
    if (spike) count += spike;
    return { date, count };
  });
})();

// ---------------------------------------------------------------------------
// 星值仪表盘的星点构成（C4 展开内容：声明 × 强度档 × 点值）

export const DEMO_STAR_BREAKDOWN: { label: string; strength: ClaimStrength; points: number }[] =
  DEMO_CLAIMS.map((claim) => ({
    label: `${claim.entryName} · ${claim.source}`,
    strength: claim.strength,
    points: claim.strength === 'strong' ? 10 : claim.strength === 'medium' ? 4 : 1,
  }));
