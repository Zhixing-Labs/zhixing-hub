<script setup lang="ts">
// 星级与星点进度（C24 口径，《10》§12.2）——五枚星形 + 星点数字 +
// 「距 n★ 还差 x 点」进度条；构成可展开（C4 纪律）；不用半星。
import { computed, ref } from 'vue';
import {
  STAR_POINTS,
  STAR_THRESHOLDS,
  entryStarPoints,
  pointsToNextStar,
  starLevel,
  type ClaimStrength,
  type StarClaimInput,
} from '@zhixing/shared';

const props = defineProps<{
  claims: readonly StarClaimInput[];
}>();

const showWhy = ref(false);

const points = computed(() => entryStarPoints(props.claims));
const level = computed(() => starLevel(points.value));
const next = computed(() => pointsToNextStar(points.value));

const bandProgress = computed(() => {
  if (!next.value) {
    return 1;
  }
  const index = 5 - next.value.next; // 当前所处区间下界 = 上一档阈值
  const floor = index === 0 ? 0 : STAR_THRESHOLDS[index - 1]!;
  const ceiling = STAR_THRESHOLDS[index]!;
  return (points.value - floor) / (ceiling - floor);
});

const breakdown = computed(() => {
  const counts: Record<ClaimStrength, { label: string; count: number; points: number }> = {
    strong: { label: '强', count: 0, points: 0 },
    medium: { label: '中', count: 0, points: 0 },
    weak: { label: '弱', count: 0, points: 0 },
  };
  for (const claim of props.claims) {
    counts[claim.strength].count += 1;
    counts[claim.strength].points += STAR_POINTS[claim.strength];
  }
  return Object.values(counts);
});
</script>

<template>
  <div class="star-progress">
    <div class="star-progress__row">
      <span class="star-progress__stars" aria-hidden="true">
        <span
          v-for="star in 5"
          :key="star"
          class="star-progress__star"
          :class="{ 'star-progress__star--on': star <= level }"
        >★</span>
      </span>
      <span class="star-progress__points">{{ points }} 点</span>
      <button
        type="button"
        class="star-progress__why"
        @click="showWhy = !showWhy"
      >{{ showWhy ? '收起构成' : '星点构成' }}</button>
    </div>
    <div class="star-progress__track">
      <span class="star-progress__fill" :style="{ width: `${Math.min(bandProgress, 1) * 100}%` }" />
    </div>
    <p class="star-progress__hint">
      <template v-if="next">距 {{ next.next }}★ 还差 {{ next.remaining }} 点</template>
      <template v-else>已达星级刻度上界（5★）</template>
    </p>
    <ul v-if="showWhy" class="star-progress__breakdown">
      <li v-for="item in breakdown" :key="item.label">
        {{ item.label }} × {{ item.count }} = {{ item.points }} 点（点值
        {{ STAR_POINTS[item.label === '强' ? 'strong' : item.label === '中' ? 'medium' : 'weak'] }}，星级规则 v1.0）
      </li>
    </ul>
  </div>
</template>

<style scoped>
.star-progress__row {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.star-progress__stars {
  font-size: 14px;
  letter-spacing: 2px;
  color: var(--border-strong);
}
.star-progress__star--on {
  color: var(--star-accent);
}
.star-progress__points {
  font-size: 12px;
  color: var(--text-primary);
  font-weight: 600;
}
.star-progress__why {
  margin-left: auto;
  font-size: 12px;
  color: var(--brand-text);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}
.star-progress__track {
  height: 6px;
  border-radius: 999px;
  background: var(--bg-subtle);
  margin-top: 6px;
  overflow: hidden;
}
.star-progress__fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--star-accent);
}
.star-progress__hint {
  margin: 4px 0 0;
  font-size: 11px;
  color: var(--text-tertiary);
}
.star-progress__breakdown {
  margin: 6px 0 0;
  padding-left: 16px;
  font-size: 11px;
  color: var(--text-secondary);
}
</style>
