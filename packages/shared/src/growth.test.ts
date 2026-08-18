import { describe, expect, it } from 'vitest';
import {
  BADGE_CATALOG_V1,
  coveragePercent,
  entryStarPoints,
  GROWTH_ACTION_SOURCES,
  GROWTH_EVENT_CATALOG,
  GROWTH_EVENT_TYPES,
  pointsToNextStar,
  STAR_POINTS,
  STAR_THRESHOLDS,
  starLevel,
} from './growth';

describe('星级计算（《02》第 14 节）', () => {
  it('星点表：强 10 / 中 4 / 弱 1', () => {
    expect(STAR_POINTS.strong).toBe(10);
    expect(STAR_POINTS.medium).toBe(4);
    expect(STAR_POINTS.weak).toBe(1);
  });

  it('阈值边界：10→1★、25→2★、50→3★、90→4★、150→5★', () => {
    expect(starLevel(9)).toBe(0);
    expect(starLevel(10)).toBe(1);
    expect(starLevel(24)).toBe(1);
    expect(starLevel(25)).toBe(2);
    expect(starLevel(50)).toBe(3);
    expect(starLevel(90)).toBe(4);
    expect(starLevel(150)).toBe(5);
    expect(starLevel(999)).toBe(5);
  });

  it('距下一星：差值正确，5★ 返回 null', () => {
    expect(pointsToNextStar(0)).toEqual({ next: 1, remaining: 10 });
    expect(pointsToNextStar(10)).toEqual({ next: 2, remaining: 15 });
    expect(pointsToNextStar(142)).toEqual({ next: 5, remaining: 8 });
    expect(pointsToNextStar(150)).toBeNull();
  });

  it('条目星点：同信封同条目至多一条计点，取点值最高', () => {
    const claims = [
      { envelopeId: 'ev-1', entryId: 'C-0031', strength: 'weak' as const },
      { envelopeId: 'ev-1', entryId: 'C-0031', strength: 'strong' as const }, // 冲销替代，取强
      { envelopeId: 'ev-2', entryId: 'C-0031', strength: 'medium' as const },
      { envelopeId: 'ev-2', entryId: 'D2-C1', strength: 'weak' as const }, // 不同条目，不计入本条目
    ];
    expect(entryStarPoints(claims.filter((c) => c.entryId === 'C-0031'))).toBe(14);
  });

  it('阈值序列严格递增（抑制刷量边际收益）', () => {
    for (let i = 1; i < STAR_THRESHOLDS.length; i += 1) {
      expect(STAR_THRESHOLDS[i]!).toBeGreaterThan(STAR_THRESHOLDS[i - 1]!);
    }
  });
});

describe('成长时间线事件目录（《04》第 4.13 节）', () => {
  it('E1–E8 齐备且目录完整', () => {
    expect(GROWTH_EVENT_TYPES).toHaveLength(8);
    for (const type of GROWTH_EVENT_TYPES) {
      expect(GROWTH_EVENT_CATALOG[type].label.length).toBeGreaterThan(0);
    }
  });

  it('E7 / E8 仅本人，其余对外目录事件', () => {
    expect(GROWTH_EVENT_CATALOG.E7.selfOnly).toBe(true);
    expect(GROWTH_EVENT_CATALOG.E8.selfOnly).toBe(true);
    for (const type of GROWTH_EVENT_TYPES) {
      if (type !== 'E7' && type !== 'E8') {
        expect(GROWTH_EVENT_CATALOG[type].selfOnly).toBe(false);
      }
    }
  });
});

describe('勋章目录 v1（Q13：纯事实里程碑）', () => {
  it('ID 唯一、三系列齐备、里程碑为正整数', () => {
    const ids = new Set(BADGE_CATALOG_V1.map((b) => b.id));
    expect(ids.size).toBe(BADGE_CATALOG_V1.length);
    const series = new Set(BADGE_CATALOG_V1.map((b) => b.series));
    expect(series).toEqual(new Set(['departure', 'accumulation', 'depth']));
    for (const badge of BADGE_CATALOG_V1) {
      expect(badge.milestone).toBeGreaterThan(0);
      expect(badge.condition.length).toBeGreaterThan(0);
    }
  });
});

describe('热力图与覆盖率口径（《04》第 4.13 节）', () => {
  it('成长动作来源封闭：提交 / 证据 / 证书，不含登录与讨论', () => {
    expect([...GROWTH_ACTION_SOURCES]).toEqual([
      'task-submission',
      'evidence-accepted',
      'certificate-issued',
    ]);
  });

  it('覆盖率为整数百分数，分母为 0 时为 0', () => {
    expect(coveragePercent({ dimension: 'D1', label: 'D1', satisfied: 6, total: 10 })).toBe(60);
    expect(coveragePercent({ dimension: 'D1', label: 'D1', satisfied: 1, total: 3 })).toBe(33);
    expect(coveragePercent({ dimension: 'D1', label: 'D1', satisfied: 0, total: 0 })).toBe(0);
  });
});
