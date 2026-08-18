// 画像页演示数据（R14，《09》3.2）——沿用「林晓」虚构学员与成长页同一套声明，
// 维度口径与《10》C22 演示一致；星级由 @zhixing/shared 规则现算，等级 / 同侪
// 档位 / 时效为演示用结论，真实派生随证据模块（《11》19.1 第 4 阶段）接入。
import type { ClaimStrength } from '@zhixing/shared';
import type { DemoClaim } from '../growth/fixtures';
import { DEMO_CLAIMS } from '../growth/fixtures';

export interface PeerBucket {
  label: string;
  count: number;
}

export interface DemoEntry {
  entryId: string;
  entryName: string;
  dimension: string;
  themeGroup: string;
  level: 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'N/A';
  decay?: { peak: string };
  thicknessMonths: number;
  claims: DemoClaim[];
  peer: { total: number; mineLabel?: string; buckets: PeerBucket[] };
}

export interface DemoDimension {
  code: string;
  name: string;
  lit: boolean;
  distribution: { label: string; count: number }[];
  groups: { name: string; entryIds: string[] }[];
}

const claimsOf = (entryId: string): DemoClaim[] =>
  DEMO_CLAIMS.filter((claim) => claim.entryId === entryId);

export const PORTRAIT_FOCUS = {
  student: '林晓',
  primary: '网络安全岗位族标准 v1（已发布）',
  alternates: ['大数据开发岗位族标准 v0.9（征求意见）', '全部维度（不按标准取景）'],
  note: '演示数据——真实画像随证据模块接入',
} as const;

export const PORTRAIT_SIGNALS = {
  activity: '高（近 30 天 12 次成长动作）',
  recency: '中（最近过审证据 26 天前）',
  strength: [
    { strength: 'strong' as ClaimStrength, label: '强', count: 6 },
    { strength: 'medium' as ClaimStrength, label: '中', count: 9 },
    { strength: 'weak' as ClaimStrength, label: '弱', count: 4 },
  ],
} as const;

export const PORTRAIT_DIMENSIONS: DemoDimension[] = [
  {
    code: 'D1',
    name: '知识与学习',
    lit: true,
    distribution: [
      { label: 'L1', count: 4 },
      { label: 'L2', count: 2 },
      { label: 'L3', count: 1 },
    ],
    groups: [{ name: '攻防与运维', entryIds: ['C-0031', 'C-0088'] }],
  },
  {
    code: 'D2',
    name: '问题解决与设计',
    lit: true,
    distribution: [
      { label: 'L1', count: 3 },
      { label: 'L2', count: 2 },
    ],
    groups: [{ name: '需求与分析', entryIds: ['D2-C1'] }],
  },
  {
    code: 'D3',
    name: '执行与交付',
    lit: true,
    distribution: [
      { label: 'L1', count: 3 },
      { label: 'L2', count: 1 },
    ],
    groups: [{ name: '交付实现', entryIds: ['D3-C2', 'D3-C4'] }],
  },
  {
    code: 'D4',
    name: '沟通与协作',
    lit: true,
    distribution: [
      { label: 'L1', count: 1 },
      { label: 'L2', count: 1 },
    ],
    groups: [{ name: '协作呈现', entryIds: ['D4-C1', 'D4-C2'] }],
  },
  {
    code: 'D5',
    name: '职业素养',
    lit: false,
    distribution: [],
    groups: [{ name: '职业操守', entryIds: ['C-0042', 'C-0095'] }],
  },
];

export const PORTRAIT_ENTRIES: DemoEntry[] = [
  {
    entryId: 'C-0031',
    entryName: '渗透测试',
    dimension: 'D1',
    themeGroup: '攻防与运维',
    level: 'L2',
    thicknessMonths: 15,
    claims: claimsOf('C-0031'),
    peer: {
      total: 64,
      mineLabel: 'L2',
      buckets: [
        { label: 'L0', count: 9 },
        { label: 'L1', count: 27 },
        { label: 'L2', count: 21 },
        { label: 'L3', count: 7 },
      ],
    },
  },
  {
    entryId: 'C-0088',
    entryName: '系统运维（累积增值）',
    dimension: 'D1',
    themeGroup: '攻防与运维',
    level: 'L1',
    thicknessMonths: 14,
    claims: claimsOf('C-0088'),
    peer: {
      total: 41,
      mineLabel: 'L1',
      buckets: [
        { label: 'L0', count: 8 },
        { label: 'L1', count: 17 },
        { label: 'L2', count: 13 },
        { label: 'L3', count: 3 },
      ],
    },
  },
  {
    entryId: 'D2-C1',
    entryName: '需求理解与问题分析',
    dimension: 'D2',
    themeGroup: '需求与分析',
    level: 'L1',
    decay: { peak: 'L2' },
    thicknessMonths: 12,
    claims: claimsOf('D2-C1'),
    peer: {
      total: 51,
      mineLabel: 'L1',
      buckets: [
        { label: 'L0', count: 11 },
        { label: 'L1', count: 22 },
        { label: 'L2', count: 14 },
        { label: 'L3', count: 4 },
      ],
    },
  },
  {
    entryId: 'D3-C2',
    entryName: '系统实现与集成',
    dimension: 'D3',
    themeGroup: '交付实现',
    level: 'L1',
    thicknessMonths: 9,
    claims: claimsOf('D3-C2'),
    peer: {
      total: 47,
      mineLabel: 'L1',
      buckets: [
        { label: 'L0', count: 8 },
        { label: 'L1', count: 19 },
        { label: 'L2', count: 16 },
        { label: 'L3', count: 4 },
      ],
    },
  },
  {
    entryId: 'D3-C4',
    entryName: '成果交付与文档',
    dimension: 'D3',
    themeGroup: '交付实现',
    level: 'L2',
    thicknessMonths: 8,
    claims: claimsOf('D3-C4'),
    peer: {
      total: 36,
      mineLabel: 'L2',
      buckets: [
        { label: 'L0', count: 6 },
        { label: 'L1', count: 15 },
        { label: 'L2', count: 12 },
        { label: 'L3', count: 3 },
      ],
    },
  },
  {
    entryId: 'D4-C1',
    entryName: '表达与呈现',
    dimension: 'D4',
    themeGroup: '协作呈现',
    level: 'L1',
    thicknessMonths: 5,
    claims: claimsOf('D4-C1'),
    peer: {
      total: 12,
      mineLabel: '',
      buckets: [],
    },
  },
  {
    entryId: 'D4-C2',
    entryName: '团队协作',
    dimension: 'D4',
    themeGroup: '协作呈现',
    level: 'L1',
    thicknessMonths: 11,
    claims: claimsOf('D4-C2'),
    peer: {
      total: 88,
      mineLabel: 'L1',
      buckets: [
        { label: 'L0', count: 10 },
        { label: 'L1', count: 30 },
        { label: 'L2', count: 34 },
        { label: 'L3', count: 13 },
        { label: 'L4', count: 1 },
      ],
    },
  },
  {
    entryId: 'C-0042',
    entryName: '职业操守与合规意识',
    dimension: 'D5',
    themeGroup: '职业操守',
    level: 'N/A',
    thicknessMonths: 0,
    claims: [],
    peer: { total: 0, buckets: [] },
  },
  {
    entryId: 'C-0095',
    entryName: '时间与精力管理',
    dimension: 'D5',
    themeGroup: '职业操守',
    level: 'L0',
    thicknessMonths: 2,
    claims: [],
    peer: { total: 0, buckets: [] },
  },
];
