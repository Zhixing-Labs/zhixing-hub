<script setup lang="ts">
// C2 同侪档位直方图（《10》§8）——匿名聚合的横向堆叠条；高亮所在档、
// 整数百分比、不出精确百分位；可比群体 < 20 人不渲染分布（《02》§9）。
import { computed } from 'vue';

const props = defineProps<{
  total: number;
  buckets: { label: string; count: number }[];
  mineLabel?: string;
}>();

const segments = computed(() => {
  if (props.total < 20) {
    return [];
  }
  return props.buckets
    .filter((bucket) => bucket.count > 0)
    .map((bucket) => ({
      ...bucket,
      percent: Math.round((bucket.count / props.total) * 100),
      mine: bucket.label === props.mineLabel,
    }));
});
</script>

<template>
  <div class="peer">
    <template v-if="total < 20">
      <p class="peer__note">可比群体不足（{{ total }} 人），暂不展示分布</p>
    </template>
    <template v-else>
      <div class="peer__bar" role="img" :aria-label="`同侪档位分布（共 ${total} 人，所在档 ${mineLabel}）`">
        <span
          v-for="segment in segments"
          :key="segment.label"
          class="peer__segment"
          :class="{ 'peer__segment--mine': segment.mine }"
          :style="{ flexGrow: segment.count }"
          :title="`${segment.label}：${segment.count} 人（约 ${segment.percent}%）${segment.mine ? ' ← 所在档' : ''}`"
        />
      </div>
      <div class="peer__legend">
        <span v-for="segment in segments" :key="segment.label" class="peer__legend-item">
          <span class="peer__legend-dot" :class="{ 'peer__legend-dot--mine': segment.mine }" />
          {{ segment.label }} · {{ segment.percent }}%{{ segment.mine ? '（所在档）' : '' }}
        </span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.peer__note {
  font-size: 12px;
  color: var(--text-tertiary);
  margin: 0;
}
.peer__bar {
  display: flex;
  height: 10px;
  border-radius: 999px;
  overflow: hidden;
  border: 1px solid var(--border-default);
}
.peer__segment {
  background: var(--bg-subtle);
}
.peer__segment--mine {
  background: var(--level-l3);
}
.peer__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-tertiary);
}
.peer__legend-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-default);
  margin-right: 4px;
  vertical-align: -1px;
}
.peer__legend-dot--mine {
  background: var(--level-l3);
  border-color: transparent;
}
</style>
