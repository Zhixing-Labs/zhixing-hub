<script setup lang="ts">
// C25 星点堆叠条（R13）——条目星点构成：强/中/弱分段 + 星级与“距下一星”星点进度
import { computed } from 'vue';
import type { ClaimStrength, StarClaimInput } from '@zhixing/shared';
import { entryStarPoints, pointsToNextStar, starLevel, STAR_POINTS } from '@zhixing/shared';

export interface StackClaim extends StarClaimInput {
  issuedAt: string;
  source: string;
}

const props = defineProps<{
  entryName: string;
  claims: StackClaim[];
}>();

const points = computed(() => entryStarPoints(props.claims));
const level = computed(() => starLevel(points.value));
const next = computed(() => pointsToNextStar(points.value));

const segments = computed(() => {
  const byStrength = new Map<ClaimStrength, { count: number; points: number }>();
  for (const claim of props.claims) {
    const entry = byStrength.get(claim.strength) ?? { count: 0, points: 0 };
    entry.count += 1;
    entry.points += STAR_POINTS[claim.strength];
    byStrength.set(claim.strength, entry);
  }
  const order: ClaimStrength[] = ['strong', 'medium', 'weak'];
  return order
    .map((strength) => ({ strength, ...(byStrength.get(strength) ?? { count: 0, points: 0 }) }))
    .filter((seg) => seg.count > 0);
});

const strengthLabel: Record<ClaimStrength, string> = { strong: '强', medium: '中', weak: '弱' };
</script>

<template>
  <div class="stack-bar">
    <p class="entry-name">{{ entryName }}</p>
    <div class="main-row">
      <span class="bar" role="img" :aria-label="`星点构成：${segments.map((s) => `${strengthLabel[s.strength]} ${s.points} 点`).join('、')}`">
        <span
          v-for="seg in segments"
          :key="seg.strength"
          class="seg"
          :class="`seg-${seg.strength}`"
          :style="{ flexGrow: seg.points }"
          :title="`${strengthLabel[seg.strength]} × ${seg.count} 条 · ${seg.points} 点`"
        >
          {{ strengthLabel[seg.strength] }} {{ seg.points }}
        </span>
      </span>
      <span class="stars" :aria-label="`${level} 星，${points} 点`">
        <span
          v-for="i in 5"
          :key="i"
          class="star"
          :class="{ earned: i <= level }"
        >★</span>
        <span class="points-text">{{ points }} 点</span>
        <span v-if="next" class="next-text">距 {{ next.next }}★ 差 {{ next.remaining }} 点</span>
      </span>
    </div>
    <details class="claims">
      <summary>展开星点构成（声明 × 强度档 × 点值）</summary>
      <ul>
        <li v-for="(claim, i) in claims" :key="i">
          信封 #{{ claim.envelopeId }} · {{ claim.source }} · {{ strengthLabel[claim.strength] }} ·
          {{ STAR_POINTS[claim.strength] }} 点 · {{ claim.issuedAt }}
        </li>
      </ul>
      <p class="rule">规则出处：星级规则 v1.0 ·《02》第 14 节——同信封同条目至多一条计点，强度档为唯一内部通货。</p>
    </details>
  </div>
</template>

<style scoped>
.stack-bar {
  display: grid;
  gap: 8px;
}

.entry-name {
  margin: 0;
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 600;
}

.main-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.bar {
  display: flex;
  gap: 3px;
  flex: 1 1 240px;
  min-width: 200px;
  height: 24px;
}

.seg {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-basis: 0;
  border-radius: 4px;
  font-size: 11px;
  min-width: 34px;
  overflow: hidden;
  white-space: nowrap;
}

.seg-strong {
  background: var(--strength-strong);
  color: var(--bg-canvas);
}

.seg-medium {
  background: var(--bg-subtle);
  border: 1px solid var(--strength-medium);
  color: var(--strength-medium);
}

.seg-weak {
  border: 1px dashed var(--strength-weak);
  color: var(--strength-weak);
}

.stars {
  display: flex;
  align-items: baseline;
  gap: 2px;
  white-space: nowrap;
}

.star {
  font-size: 16px;
  color: var(--border-strong);
}

.star.earned {
  color: var(--star-accent);
}

.points-text {
  margin-left: 6px;
  color: var(--text-primary);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.next-text {
  color: var(--text-tertiary);
  font-size: 12px;
}

.claims summary {
  color: var(--brand-text);
  font-size: 12px;
  cursor: pointer;
}

.claims ul {
  margin: 6px 0;
  padding-left: 18px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 19px;
}

.rule {
  margin: 0;
  color: var(--text-tertiary);
  font-size: 11px;
  line-height: 17px;
}
</style>
