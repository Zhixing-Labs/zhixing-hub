<script setup lang="ts">
// C21 勋章墙（Q13）——纯事实里程碑、仅本人可见；灰态展示条件与事实计数
import { computed } from 'vue';
import type { BadgeSeries } from '@zhixing/shared';
import { BADGE_CATALOG_V1, BADGE_SERIES_LABELS } from '@zhixing/shared';

const props = defineProps<{
  earned: Record<string, string>;
  progress: Record<string, number>;
}>();

const seriesOrder: BadgeSeries[] = ['departure', 'accumulation', 'depth'];

const seriesIcons: Record<BadgeSeries, string> = {
  departure: '✦',
  accumulation: '◆',
  depth: '▲',
};

const groups = computed(() =>
  seriesOrder.map((series) => ({
    series,
    label: BADGE_SERIES_LABELS[series],
    badges: BADGE_CATALOG_V1.filter((badge) => badge.series === series).map((badge) => ({
      ...badge,
      earnedAt: props.earned[badge.id],
      current: props.progress[badge.id],
    })),
  })),
);
</script>

<template>
  <div class="badge-wall">
    <p class="visibility-note">勋章墙仅本人可见——不进企业视图、简历分享与同侪聚合（《04》第 4.13 节）。</p>
    <section v-for="group in groups" :key="group.series" class="series">
      <h4 class="series-title">{{ seriesIcons[group.series] }} {{ group.label }}</h4>
      <ul class="grid">
        <li
          v-for="badge in group.badges"
          :key="badge.id"
          class="badge-card"
          :class="{ locked: !badge.earnedAt }"
        >
          <p class="badge-title">{{ badge.title }}</p>
          <p class="badge-condition">{{ badge.condition }}</p>
          <p v-if="badge.earnedAt" class="badge-date">{{ badge.earnedAt }} 达成</p>
          <p v-else-if="badge.current !== undefined && badge.current > 0" class="badge-progress">
            {{ badge.current }}/{{ badge.milestone }}
          </p>
          <p v-else class="badge-progress dim">未开始</p>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.badge-wall {
  display: grid;
  gap: 16px;
}

.visibility-note {
  margin: 0;
  padding: 6px 12px;
  border: 1px dashed var(--border-strong);
  border-radius: 8px;
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 18px;
}

.series-title {
  margin: 0 0 8px;
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 600;
}

.grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
  gap: 10px;
}

.badge-card {
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--bg-surface);
  padding: 12px;
}

.badge-card.locked {
  opacity: 0.55;
  border-style: dashed;
}

.badge-title {
  margin: 0;
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 600;
}

.badge-condition {
  margin: 4px 0 6px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 17px;
  min-height: 34px;
}

.badge-date {
  margin: 0;
  color: var(--star-accent);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.badge-progress {
  margin: 0;
  color: var(--brand-text);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.badge-progress.dim {
  color: var(--text-tertiary);
}
</style>
