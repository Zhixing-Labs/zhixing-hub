<script setup lang="ts">
// C19 成长时间线（R13）——事件目录 E1–E8；E6 背景弱化；E7/E8 仅本人且中性配色
import type { GrowthEventType } from '@zhixing/shared';
import { GROWTH_EVENT_CATALOG } from '@zhixing/shared';

export interface TimelineEvent {
  id: string;
  type: GrowthEventType;
  date: string;
  title: string;
  detail: string;
  evidence?: string;
}

defineProps<{
  events: TimelineEvent[];
}>();

const typeClass: Record<GrowthEventType, string> = {
  E1: 't-evidence',
  E2: 't-cert',
  E3: 't-levelup',
  E4: 't-thickness',
  E5: 't-finish',
  E6: 't-quiet',
  E7: 't-neutral',
  E8: 't-neutral',
};
</script>

<template>
  <ol class="timeline">
    <li v-for="event in events" :key="event.id" class="event" :class="[typeClass[event.type], { quiet: event.type === 'E6' }]">
      <div class="rail">
        <span class="node"></span>
        <span class="date">{{ event.date }}</span>
      </div>
      <div class="card">
        <p class="title">
          <span class="type-tag">{{ GROWTH_EVENT_CATALOG[event.type].label }}</span>
          {{ event.title }}
          <span v-if="GROWTH_EVENT_CATALOG[event.type].selfOnly" class="self-only">仅本人可见</span>
        </p>
        <p class="detail">{{ event.detail }}</p>
        <details v-if="event.evidence || event.detail">
          <summary>展开：证据与下一步</summary>
          <p class="evidence">依据：{{ event.evidence ?? '档案事件流' }}</p>
          <p class="actions">
            <span class="link disabled" title="演示态——随证据模块接入">查看证据链</span> ·
            <span class="link disabled" title="演示态——随推荐模块接入">下一步建议</span>
          </p>
        </details>
      </div>
    </li>
  </ol>
</template>

<style scoped>
.timeline {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}

.event {
  display: grid;
  grid-template-columns: 92px 1fr;
  gap: 12px;
}

.rail {
  display: grid;
  justify-items: start;
  gap: 4px;
  padding-top: 10px;
}

.node {
  width: 10px;
  height: 10px;
  border-radius: 999px;
}

.date {
  color: var(--text-tertiary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.card {
  border: 1px solid var(--border-default);
  border-left: 3px solid var(--border-strong);
  border-radius: 8px;
  background: var(--bg-surface);
  padding: 10px 14px;
}

.t-evidence .card { border-left-color: var(--success); }
.t-evidence .node { background: var(--success); }
.t-cert .card { border-left-color: var(--star-accent); }
.t-cert .node { background: var(--star-accent); }
.t-levelup .card { border-left-color: var(--brand-solid); }
.t-levelup .node { background: var(--brand-solid); }
.t-thickness .card { border-left-color: var(--brand-text); }
.t-thickness .node { background: var(--brand-text); }
.t-finish .card { border-left-color: var(--success); }
.t-finish .node { background: var(--success); }
.t-quiet .node { background: var(--border-strong); }
.t-neutral .node { background: var(--text-tertiary); }
.t-neutral .card { border-left-style: dashed; border-left-color: var(--text-tertiary); }

.event.quiet {
  opacity: 0.62;
}

.title {
  margin: 0;
  color: var(--text-primary);
  font-size: 14px;
  line-height: 22px;
}

.type-tag {
  display: inline-block;
  margin-right: 6px;
  padding: 1px 8px;
  border-radius: 6px;
  background: var(--bg-subtle);
  color: var(--text-secondary);
  font-size: 11px;
  vertical-align: 1px;
}

.self-only {
  margin-left: 6px;
  padding: 1px 6px;
  border: 1px dashed var(--text-tertiary);
  border-radius: 6px;
  color: var(--text-tertiary);
  font-size: 10px;
}

.detail {
  margin: 4px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 19px;
}

details {
  margin-top: 6px;
}

summary {
  color: var(--brand-text);
  font-size: 12px;
  cursor: pointer;
}

.evidence,
.actions {
  margin: 4px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 18px;
}

.link {
  color: var(--brand-text);
}

.link.disabled {
  color: var(--text-tertiary);
  text-decoration: line-through;
  text-decoration-color: var(--border-strong);
}

@media (max-width: 768px) {
  .event {
    grid-template-columns: 1fr;
  }

  .rail {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-top: 0;
  }
}
</style>
