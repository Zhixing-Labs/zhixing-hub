<script setup lang="ts">
// C22 五维点亮与成长阶梯（R13）——点亮 = 该维存在 ≥1 条 L1+ 结论（存在性判断，非等级档位）
import { computed, ref } from 'vue';
import type { EChartsCoreOption } from '@/lib/echarts';
import { cssVar } from '@/lib/theme';
import { useChart } from '@/composables/useChart';

export interface DimensionRow {
  code: string;
  label: string;
  lit: boolean;
  counts: { l1: number; l2: number; l3: number; blank: number };
}

const props = defineProps<{
  dims: DimensionRow[];
  monthly: { month: string; count: number }[];
}>();

type Segment = { key: 'l1' | 'l2' | 'l3' | 'blank'; label: string; value: number; cssVarName: string };

const rows = computed(() =>
  props.dims.map((dim) => {
    const segments: Segment[] = [
      { key: 'l1', label: 'L1', value: dim.counts.l1, cssVarName: '--level-l1' },
      { key: 'l2', label: 'L2', value: dim.counts.l2, cssVarName: '--level-l2' },
      { key: 'l3', label: 'L3', value: dim.counts.l3, cssVarName: '--level-l3' },
      { key: 'blank', label: '留白', value: dim.counts.blank, cssVarName: '' },
    ];
    const total = segments.reduce((sum, seg) => sum + seg.value, 0) || 1;
    return { dim, segments, total };
  }),
);

const ladder = ref<HTMLElement | null>(null);

useChart(ladder, () => {
  const tertiary = cssVar('--text-tertiary');
  return {
    grid: { left: 28, right: 12, top: 12, bottom: 24 },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: props.monthly.map((m) => m.month),
      axisLabel: { color: tertiary, fontSize: 10 },
      axisLine: { lineStyle: { color: cssVar('--border-strong') } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: { color: tertiary, fontSize: 10 },
      splitLine: { lineStyle: { color: cssVar('--border-default') } },
    },
    series: [
      {
        type: 'line',
        step: 'end',
        symbolSize: 5,
        data: props.monthly.map((m) => m.count),
        lineStyle: { color: cssVar('--brand-solid'), width: 2 },
        itemStyle: { color: cssVar('--brand-solid') },
      },
    ],
  } satisfies EChartsCoreOption;
});
</script>

<template>
  <div class="lightup">
    <ul class="dim-list">
      <li v-for="row in rows" :key="row.dim.code" class="dim-row">
        <span class="dot" :class="{ lit: row.dim.lit }" :aria-label="row.dim.lit ? '已点亮' : '未点亮'"></span>
        <span class="dim-name">{{ row.dim.code }} {{ row.dim.label }}</span>
        <span class="stack">
          <span
            v-for="seg in row.segments"
            :key="seg.key"
            class="seg"
            :class="{ blank: seg.key === 'blank', zero: seg.value === 0 }"
            :style="seg.key !== 'blank' && seg.value > 0 ? { flexGrow: seg.value, background: `var(${seg.cssVarName})` } : { flexGrow: seg.value }"
            :title="`${seg.label} × ${seg.value}`"
          ></span>
        </span>
        <span class="dim-counts">
          L1×{{ row.dim.counts.l1 }} L2×{{ row.dim.counts.l2 }} L3×{{ row.dim.counts.l3 }}
          留白×{{ row.dim.counts.blank }}
        </span>
      </li>
    </ul>
    <div ref="ladder" class="ladder" aria-label="每月 L1 及以上条目数阶梯图"></div>
    <p class="caption">阶梯图 = 每月「L1 及以上条目数」的事实计数（step 渲染，非斜线拟合、非均分）。</p>
  </div>
</template>

<style scoped>
.dim-list {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
  display: grid;
  gap: 8px;
}

.dim-row {
  display: grid;
  grid-template-columns: 16px 150px 1fr auto;
  gap: 10px;
  align-items: center;
}

.dot {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  border: 2px dashed var(--border-strong);
}

.dot.lit {
  border: 2px solid var(--brand-solid);
  background: var(--brand-solid);
}

.dim-name {
  color: var(--text-primary);
  font-size: 13px;
}

.stack {
  display: flex;
  height: 10px;
  gap: 2px;
  min-width: 120px;
}

.seg {
  flex-basis: 0;
  border-radius: 2px;
}

.seg.blank {
  border: 1px dashed var(--border-strong);
  background: transparent;
}

.seg.zero {
  display: none;
}

.dim-counts {
  color: var(--text-tertiary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.ladder {
  width: 100%;
  height: 160px;
}

.caption {
  margin: 4px 0 0;
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 18px;
}

@media (max-width: 768px) {
  .dim-row {
    grid-template-columns: 14px 1fr;
    grid-template-areas:
      'dot name'
      'dot stack'
      'dot counts';
  }

  .dot { grid-area: dot; }
  .dim-name { grid-area: name; }
  .stack { grid-area: stack; min-width: 0; }
  .dim-counts { grid-area: counts; }
}
</style>
