<script setup lang="ts">
// C24 星值仪表与星级（R13）——仪表盘仅用于总星值/覆盖率（整数与星点，必带 C4 展开）
import { computed, ref } from 'vue';
import type { ClaimStrength } from '@zhixing/shared';
import { pointsToNextStar } from '@zhixing/shared';
import type { EChartsCoreOption } from '@/lib/echarts';
import { cssVar } from '@/lib/theme';
import { useChart } from '@/composables/useChart';

const props = defineProps<{
  points: number;
  level: number;
  breakdown: { label: string; strength: ClaimStrength; points: number }[];
}>();

const container = ref<HTMLElement | null>(null);
const showWhy = ref(false);

const next = computed(() => pointsToNextStar(props.points));
const gaugeMax = 300; // v1 演示刻度：5★·10 条目量级的整数上界

useChart(container, () => {
  const textPrimary = cssVar('--text-primary');
  const textSecondary = cssVar('--text-secondary');
  const borderDefault = cssVar('--border-default');
  return {
    series: [
      {
        type: 'gauge',
        startAngle: 210,
        endAngle: -30,
        min: 0,
        max: gaugeMax,
        radius: '100%',
        center: ['50%', '58%'],
        progress: { show: true, width: 12, itemStyle: { color: cssVar('--star-accent') } },
        axisLine: { lineStyle: { width: 12, color: [[1, borderDefault]] } },
        pointer: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        anchor: { show: false },
        detail: {
          valueAnimation: false,
          formatter: '{value} 点',
          color: textPrimary,
          fontSize: 22,
          fontWeight: 600,
          offsetCenter: [0, '4%'],
        },
        title: {
          show: true,
          offsetCenter: [0, '32%'],
          color: textSecondary,
          fontSize: 12,
        },
        data: [{ value: props.points, name: '总星值（成长值，星级规则 v1.0）' }],
      },
    ],
  } satisfies EChartsCoreOption;
});

const strengthLabel: Record<ClaimStrength, string> = { strong: '强', medium: '中', weak: '弱' };
</script>

<template>
  <section class="star-gauge">
    <div ref="container" class="gauge" aria-label="总星值仪表盘"></div>
    <div class="meta">
      <div class="stars" :aria-label="`总星值 ${points} 点`">
        <span
          v-for="i in 5"
          :key="i"
          class="star"
          :class="{ earned: i <= level }"
        >★</span>
      </div>
      <p class="points">
        总星值 <strong>{{ points }}</strong> 点
        <span v-if="next">· 距 {{ next.next }}★ 满格量级还差 {{ next.remaining }} 点</span>
        <span v-else>· 满格</span>
      </p>
      <p class="hint">星级回答“积累了多少”；等级才回答“能不能”（《02》第 14 节双轨）。</p>
      <button class="why-toggle" type="button" @click="showWhy = !showWhy">
        ⓘ 这个数是什么、由什么构成
      </button>
      <div v-if="showWhy" class="why-panel">
        <p class="why-line"><strong>口径</strong>：全部条目星点之和；每条有效声明按强度档计点（强 10 / 中 4 / 弱 1）。</p>
        <p class="why-line"><strong>构成</strong>（声明 × 强度 × 点值）：</p>
        <ul class="why-list">
          <li v-for="(item, i) in breakdown" :key="i">
            {{ item.label }} · {{ strengthLabel[item.strength] }} · {{ item.points }} 点
          </li>
        </ul>
        <p class="why-line"><strong>规则出处</strong>：星级规则 v1.0 ·《02》第 14 节（七元版本向量）。</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.star-gauge {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 16px;
  align-items: center;
}

.gauge {
  width: 200px;
  height: 150px;
}

.stars .star {
  font-size: 22px;
  color: var(--border-strong);
}

.stars .star.earned {
  color: var(--star-accent);
}

.meta .points {
  margin: 6px 0 2px;
  color: var(--text-primary);
  font-size: 15px;
}

.meta .hint {
  margin: 0 0 10px;
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 18px;
}

.why-toggle {
  border: none;
  background: none;
  padding: 0;
  color: var(--brand-text);
  font-size: 13px;
  cursor: pointer;
}

.why-panel {
  margin-top: 8px;
  padding: 10px 12px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--bg-subtle);
}

.why-line {
  margin: 2px 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 18px;
}

.why-list {
  max-height: 180px;
  overflow-y: auto;
  margin: 4px 0;
  padding-left: 18px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 18px;
}

@media (max-width: 768px) {
  .star-gauge {
    grid-template-columns: 1fr;
    justify-items: center;
  }
}
</style>
