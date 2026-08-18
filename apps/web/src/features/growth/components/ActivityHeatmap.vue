<script setup lang="ts">
// C20 活跃热力图（R13）——近 12 个月成长动作计数（提交/证据/证书），5 档品牌蓝阶
import { ref } from 'vue';
import type { EChartsCoreOption } from '@/lib/echarts';
import { cssVar } from '@/lib/theme';
import { useChart } from '@/composables/useChart';

const props = defineProps<{
  days: { date: string; count: number }[];
  range: { start: string; end: string };
}>();

const container = ref<HTMLElement | null>(null);

useChart(container, () => {
  const monthColor = cssVar('--text-tertiary');
  const canvasColor = cssVar('--bg-canvas');
  return {
    tooltip: {
      formatter: (params: { value: [string, number] }) =>
        `${params.value[0]}<br/>成长动作 ${params.value[1]} 次`,
    },
    visualMap: {
      type: 'piecewise',
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: monthColor, fontSize: 10 },
      pieces: [
        { lte: 0, color: cssVar('--bg-subtle') },
        { gt: 0, lte: 2, color: cssVar('--heat-1') },
        { gt: 2, lte: 4, color: cssVar('--heat-2') },
        { gt: 4, lte: 7, color: cssVar('--heat-3') },
        { gt: 7, lte: 11, color: cssVar('--heat-4') },
        { gt: 11, color: cssVar('--heat-5') },
      ],
    },
    calendar: {
      top: 18,
      left: 28,
      right: 8,
      cellSize: ['auto', 12],
      range: [props.range.start, props.range.end],
      itemStyle: { color: 'transparent', borderWidth: 2, borderColor: canvasColor },
      splitLine: { show: false },
      yearLabel: { show: false },
      monthLabel: { color: monthColor, fontSize: 10 },
      dayLabel: { show: false },
    },
    series: [
      {
        type: 'heatmap',
        coordinateSystem: 'calendar',
        data: props.days.map((day) => [day.date, day.count]),
      },
    ],
  } satisfies EChartsCoreOption;
});
</script>

<template>
  <div class="heatmap-block">
    <p class="caption">
      成长动作 = 任务提交 + 过审证据 + 证书发放；登录与浏览不计（《04》第 4.13 节）。
    </p>
    <div ref="container" class="heatmap" aria-label="近 12 个月活跃热力图"></div>
  </div>
</template>

<style scoped>
.heatmap-block {
  width: 100%;
}

.heatmap {
  width: 100%;
  height: 170px;
}

.caption {
  margin: 0 0 4px;
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 18px;
}
</style>
