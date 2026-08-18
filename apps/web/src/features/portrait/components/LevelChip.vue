<script setup lang="ts">
// C1 等级芯片（《10》§8）——圆点 + 文字标签，颜色仅承担序数（紫罗兰阶 2.4）。
// 变体：默认 / 留白 N/A / L0 仅本人 / 时效态（右上小三角）。
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    level: 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'N/A';
    decay?: { peak: string } | null;
    size?: 'inline' | 'card';
  }>(),
  { decay: null, size: 'card' },
);

const LEVEL_TOKENS: Record<string, string> = {
  L1: '--level-l1',
  L2: '--level-l2',
  L3: '--level-l3',
  L4: '--level-l4',
};

const dotColor = computed(() =>
  props.level === 'N/A'
    ? 'transparent'
    : `var(${LEVEL_TOKENS[props.level] ?? '--level-l1'})`,
);
</script>

<template>
  <span
    class="chip"
    :class="[`chip--${size}`, { 'chip--blank': level === 'N/A', 'chip--l0': level === 'L0' }]"
    :title="decay ? `${level}，曾达 ${decay.peak}，可通过新证据恢复` : level === 'N/A' ? '无证据条目（留白）' : level === 'L0' ? 'L0 观察（仅本人可见）' : `等级 ${level}`"
  >
    <span class="chip__dot" :style="{ backgroundColor: dotColor }" />
    <span class="chip__label">{{ level === 'N/A' ? '留白' : level }}</span>
    <span v-if="decay" class="chip__decay-mark" />
  </span>
</template>

<style scoped>
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border-default);
  border-radius: 999px;
  background: var(--bg-surface);
  padding: 0 10px;
  position: relative;
  white-space: nowrap;
}
.chip--inline { height: 22px; }
.chip--card { height: 28px; }
.chip__dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  flex: none;
}
.chip--blank .chip__dot,
.chip--l0 .chip__dot {
  border: 1px dashed var(--border-strong);
  background: transparent;
}
.chip--l0 .chip__label { color: var(--text-tertiary); }
.chip__label {
  font-size: 12px;
  color: var(--text-primary);
  font-weight: 600;
}
.chip--blank .chip__label { color: var(--text-tertiary); font-weight: 400; }
/* 时效态：右上角小三角（C9 入口），hover/title 出恢复说明 */
.chip__decay-mark {
  position: absolute;
  top: -1px;
  right: -1px;
  width: 0;
  height: 0;
  border-top: 8px solid var(--warning);
  border-left: 8px solid transparent;
  border-radius: 0 999px 0 0;
}
</style>
