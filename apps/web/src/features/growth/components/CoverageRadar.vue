<script setup lang="ts">
// C23 覆盖率雷达（R13）——轴 = 各维对目标岗位族标准的覆盖 n/m（唯一合法雷达口径）
import { ref } from 'vue';
import type { DimensionCoverage } from '@zhixing/shared';
import { coveragePercent } from '@zhixing/shared';
import type { EChartsCoreOption } from '@/lib/echarts';
import { cssVar } from '@/lib/theme';
import { useChart } from '@/composables/useChart';

const props = defineProps<{
  coverage: DimensionCoverage[];
}>();

const container = ref<HTMLElement | null>(null);
const expanded = ref<string | null>(null);

useChart(container, () => {
  const secondary = cssVar('--text-secondary');
  return {
    tooltip: {
      trigger: 'item',
      formatter: () => '对目标岗位族标准的条目覆盖率',
    },
    radar: {
      radius: '68%',
      indicator: props.coverage.map((item) => ({
        name: `${item.label} ${coveragePercent(item)}%`,
        max: 100,
      })),
      axisName: { color: secondary, fontSize: 11 },
      axisLine: { lineStyle: { color: cssVar('--border-strong') } },
      splitLine: { lineStyle: { color: cssVar('--border-default') } },
      splitArea: { areaStyle: { color: ['transparent'] } },
    },
    series: [
      {
        type: 'radar',
        data: [
          {
            value: props.coverage.map(coveragePercent),
            name: '覆盖率',
            lineStyle: { color: cssVar('--brand-solid'), width: 2 },
            itemStyle: { color: cssVar('--brand-solid') },
            areaStyle: { color: cssVar('--brand-area') },
          },
        ],
      },
    ],
  } satisfies EChartsCoreOption;
});

function toggleExpand(dimension: string): void {
  expanded.value = expanded.value === dimension ? null : dimension;
}
</script>

<template>
  <div class="radar-block">
    <div ref="container" class="radar" aria-label="对目标岗位族标准的覆盖率雷达"></div>
    <ul class="axis-list">
      <li v-for="item in coverage" :key="item.dimension">
        <button class="axis-row" type="button" @click="toggleExpand(item.dimension)">
          <span class="axis-name">{{ item.label }}</span>
          <span class="axis-value">{{ item.satisfied }}/{{ item.total }}（{{ coveragePercent(item) }}%）</span>
          <span class="axis-action">展开条目清单</span>
        </button>
        <p v-if="expanded === item.dimension" class="axis-detail">
          演示态：此处展开该维满足 / 未满足条目的逐条清单（结论等级 ≥ 要求等级的二值口径，《02》第 9 节）。
        </p>
      </li>
    </ul>
    <p class="caption">雷达轴 = 覆盖率 n/m（R13 唯一合法口径）；以能力等级或星值为轴的能力雷达仍被禁止。</p>
  </div>
</template>

<style scoped>
.radar-block {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  align-items: center;
}

.radar {
  width: 100%;
  height: 220px;
}

.axis-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.axis-row {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-areas: 'name value' 'action action';
  width: 100%;
  padding: 6px 8px;
  border: none;
  border-radius: 6px;
  background: none;
  cursor: pointer;
  text-align: left;
}

.axis-row:hover {
  background: var(--bg-subtle);
}

.axis-name {
  grid-area: name;
  color: var(--text-primary);
  font-size: 13px;
}

.axis-value {
  grid-area: value;
  color: var(--brand-text);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.axis-action {
  grid-area: action;
  color: var(--text-tertiary);
  font-size: 11px;
}

.axis-detail {
  margin: 4px 8px 8px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 18px;
}

.caption {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 18px;
}

@media (max-width: 768px) {
  .radar-block {
    grid-template-columns: 1fr;
  }
}
</style>
