<script setup lang="ts">
// 我的画像页（《09》3.2，R14 首个完整实现）——演示数据驱动，真实数据随证据模块接入。
// 页面叙事按「读形 → 下钻」组织：身份与取景 → 画像速览（形）→ 维度轨 + 条目卡流（证据）。
// 视觉语言对齐《10》：白底留白、细分割线、紫罗兰承担等级序数、品牌蓝只做交互。
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { ClaimStrength } from '@zhixing/shared';
import DemoBanner from '../growth/components/DemoBanner.vue';
import LevelChip from './components/LevelChip.vue';
import PeerHistogram from './components/PeerHistogram.vue';
import StarProgress from './components/StarProgress.vue';
import {
  PORTRAIT_DIMENSIONS,
  PORTRAIT_ENTRIES,
  PORTRAIT_FOCUS,
  PORTRAIT_SIGNALS,
} from './fixtures';

const focus = ref<string>(PORTRAIT_FOCUS.primary);
const focusOptions = [PORTRAIT_FOCUS.primary, ...PORTRAIT_FOCUS.alternates];

/** 画像速览：五维点亮 + L1+ 计数 + 分布微条，一行读完「形」 */
const shape = computed(() =>
  PORTRAIT_DIMENSIONS.map((dimension) => ({
    ...dimension,
    total: dimension.distribution.reduce((sum, band) => sum + band.count, 0),
  })),
);

const groupedEntries = computed(() => {
  const groups = new Map<string, typeof PORTRAIT_ENTRIES>();
  for (const entry of PORTRAIT_ENTRIES) {
    const list = groups.get(entry.themeGroup) ?? [];
    list.push(entry);
    groups.set(entry.themeGroup, list);
  }
  return [...groups.entries()].map(([name, entries]) => ({
    id: `group-${name}`,
    name,
    entries,
  }));
});

const litCount = computed(
  () => shape.value.filter((dimension) => dimension.lit).length,
);
const l1plusTotal = computed(() =>
  shape.value.reduce((sum, dimension) => sum + dimension.total, 0),
);

/** 维度轨滚动跟随：当前可视分组高亮 */
const activeGroup = ref('');
let observer: IntersectionObserver | null = null;
onMounted(() => {
  observer = new IntersectionObserver(
    (records) => {
      const visible = records
        .filter((record) => record.isIntersecting)
        .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top)[0];
      if (visible?.target.id) {
        activeGroup.value = visible.target.id;
      }
    },
    { rootMargin: '-96px 0px -60% 0px' },
  );
  for (const element of document.querySelectorAll('[data-portrait-group]')) {
    observer.observe(element);
  }
});
onBeforeUnmount(() => observer?.disconnect());

const strengthColor = (strength: ClaimStrength) => `var(--strength-${strength})`;

const railLinkClass = (dimensionCode: string) =>
  dimensionCode === activeDimensionOfGroup(activeGroup.value)
    ? 'portrait__rail-link--active'
    : '';

function activeDimensionOfGroup(groupId: string): string {
  const group = groupedEntries.value.find((item) => item.id === groupId);
  return group?.entries[0]?.dimension ?? '';
}
</script>

<template>
  <div class="portrait">
    <DemoBanner>{{ PORTRAIT_FOCUS.note }}</DemoBanner>

    <!-- 身份与取景：姓名在左、取景在右下、信号做一条安静的元信息行 -->
    <header class="portrait__masthead">
      <div class="portrait__identity">
        <h1 class="portrait__name">{{ PORTRAIT_FOCUS.student }}</h1>
        <p class="portrait__target">{{ focus }}</p>
      </div>
      <nav class="portrait__framing" aria-label="画像取景">
        <button
          v-for="option in focusOptions"
          :key="option"
          type="button"
          class="portrait__frame-option"
          :class="{ 'portrait__frame-option--active': option === focus }"
          @click="focus = option"
        >
          {{ option.replace(/（.*?）/, '') }}
        </button>
      </nav>
    </header>

    <div class="portrait__meta">
      <span>{{ litCount }} / 5 维已点亮</span>
      <span class="portrait__meta-divider" />
      <span>{{ l1plusTotal }} 条 L1+ 结论</span>
      <span class="portrait__meta-divider" />
      <span>活跃度 {{ PORTRAIT_SIGNALS.activity.split('（')[0] }} · 近期性 {{ PORTRAIT_SIGNALS.recency.split('（')[0] }}</span>
      <span class="portrait__meta-divider" />
      <span class="portrait__meta-strength">
        强度构成
        <span
          v-for="item in PORTRAIT_SIGNALS.strength"
          :key="item.label"
          class="portrait__strength"
        >
          <span class="portrait__strength-dot" :style="{ backgroundColor: strengthColor(item.strength) }" />
          {{ item.label }} × {{ item.count }}
        </span>
      </span>
    </div>

    <!-- 画像速览：五维一行读完，形先于细节 -->
    <section class="portrait__shape" aria-label="五维速览">
      <div
        v-for="dimension in shape"
        :key="dimension.code"
        class="portrait__shape-cell"
        :class="{ 'portrait__shape-cell--dim': !dimension.lit }"
      >
        <span class="portrait__shape-dot" :class="{ 'portrait__shape-dot--lit': dimension.lit }" />
        <span class="portrait__shape-code">{{ dimension.code }}</span>
        <span class="portrait__shape-name">{{ dimension.name }}</span>
        <div v-if="dimension.distribution.length" class="portrait__shape-bar">
          <span
            v-for="band in dimension.distribution"
            :key="band.label"
            :style="{ flexGrow: band.count, backgroundColor: `var(--level-${band.label.toLowerCase()})` }"
            :title="`${band.label} × ${band.count}`"
          />
        </div>
        <span class="portrait__shape-count">{{ dimension.lit ? `${dimension.total} 条 L1+` : '未点亮' }}</span>
      </div>
    </section>

    <div class="portrait__body">
      <!-- 维度轨：导航 + 上卷仪表合一，粘性、滚动跟随 -->
      <aside class="portrait__rail">
        <p class="portrait__rail-title">维度</p>
        <a
          v-for="group in groupedEntries"
          :key="group.id"
          :href="`#${group.id}`"
          class="portrait__rail-link"
          :class="{ 'portrait__rail-link--active': group.id === activeGroup }"
        >
          <span class="portrait__rail-code">{{ group.entries[0]?.dimension }}</span>
          {{ group.name }}
          <span class="portrait__rail-count">{{ group.entries.length }}</span>
        </a>
        <div class="portrait__rail-legend">
          <p class="portrait__rail-legend-title">读法</p>
          <p class="portrait__rail-legend-item"><span class="portrait__legend-chip" /> 芯片 = 判定等级（序数）</p>
          <p class="portrait__rail-legend-item"><span class="portrait__legend-star">★</span> 星级 = 成长值（连续）</p>
          <p class="portrait__rail-legend-item">一切数字可展开到声明清单</p>
        </div>
      </aside>

      <!-- 条目卡流：留白与层级靠分割线，不靠盒子 -->
      <main class="portrait__flow">
        <section
          v-for="group in groupedEntries"
          :id="group.id"
          :key="group.id"
          class="portrait__group"
          data-portrait-group
        >
          <header class="portrait__group-head">
            <h2 class="portrait__group-title">{{ group.name }}</h2>
            <span class="portrait__group-dim">{{ group.entries[0]?.dimension }} · {{ PORTRAIT_DIMENSIONS.find((d) => d.code === group.entries[0]?.dimension)?.name }}</span>
          </header>

          <article
            v-for="entry in group.entries"
            :key="entry.entryId"
            class="entry"
            :class="{
              'entry--decay': Boolean(entry.decay),
              'entry--l0': entry.level === 'L0',
              'entry--blank': entry.level === 'N/A',
            }"
          >
            <div class="entry__main">
              <div class="entry__head">
                <h3 class="entry__name">{{ entry.entryName }}</h3>
                <LevelChip :level="entry.level" :decay="entry.decay" />
              </div>
              <p v-if="entry.decay" class="entry__decay">
                曾达 {{ entry.decay.peak }} · 时效回落，可通过新证据恢复
              </p>
              <p v-if="entry.level === 'L0'" class="entry__note">L0 观察 · 仅本人可见，不进对外展示</p>
              <p v-if="entry.level === 'N/A'" class="entry__note">
                尚无证据——<a class="entry__cta" href="/student/growth">去成长推荐找机会 →</a>
              </p>
            </div>

            <div v-if="entry.claims.length" class="entry__data">
              <StarProgress :claims="entry.claims" />
              <div class="entry__peer">
                <PeerHistogram
                  :total="entry.peer.total"
                  :buckets="entry.peer.buckets"
                  :mine-label="entry.peer.mineLabel"
                />
                <p class="entry__meta">经验厚度 {{ entry.thicknessMonths }} 个月 · <a class="entry__cta" href="/student/growth">审计链 →</a></p>
              </div>
            </div>
          </article>
        </section>
      </main>
    </div>
  </div>
</template>

<style scoped>
.portrait {
  max-width: 1160px;
  margin: 0 auto;
  padding: 20px 24px 64px;
  background: var(--bg-canvas);
  min-height: 100vh;
  color: var(--text-primary);
}

/* ── 身份与取景 ───────────────────────────── */
.portrait__masthead {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  padding-bottom: 18px;
}
.portrait__name {
  margin: 0;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: 0.5px;
}
.portrait__target {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--text-secondary);
}
.portrait__framing {
  display: inline-flex;
  border: 1px solid var(--border-default);
  border-radius: 999px;
  overflow: hidden;
  background: var(--bg-surface);
}
.portrait__frame-option {
  border: none;
  background: none;
  padding: 6px 14px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease;
}
.portrait__frame-option + .portrait__frame-option {
  border-left: 1px solid var(--border-default);
}
.portrait__frame-option--active {
  color: var(--brand-text);
  background: var(--brand-area);
}

/* ── 元信息行：一条安静的轨迹信号 ─────────── */
.portrait__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
  padding: 10px 0;
  border-top: 1px solid var(--border-default);
  border-bottom: 1px solid var(--border-default);
  font-size: 12px;
  color: var(--text-secondary);
}
.portrait__meta-divider {
  width: 1px;
  height: 10px;
  background: var(--border-default);
}
.portrait__meta-strength {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}
.portrait__strength {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text-secondary);
}
.portrait__strength-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
}

/* ── 画像速览：五维一行 ───────────────────── */
.portrait__shape {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 14px;
  padding: 18px 0 6px;
}
.portrait__shape-cell {
  display: grid;
  grid-template-columns: auto auto 1fr;
  grid-template-rows: auto auto auto;
  align-items: center;
  column-gap: 6px;
  row-gap: 4px;
}
.portrait__shape-dot {
  grid-row: 1;
  width: 9px;
  height: 9px;
  border-radius: 999px;
  border: 1px dashed var(--border-strong);
}
.portrait__shape-dot--lit {
  background: var(--brand-solid);
  border-color: transparent;
}
.portrait__shape-code {
  grid-row: 1;
  font-size: 13px;
  font-weight: 700;
}
.portrait__shape-name {
  grid-row: 1;
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.portrait__shape-bar {
  grid-column: 1 / -1;
  display: flex;
  height: 5px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--bg-subtle);
}
.portrait__shape-count {
  grid-column: 1 / -1;
  font-size: 11px;
  color: var(--text-tertiary);
}
.portrait__shape-cell--dim .portrait__shape-code,
.portrait__shape-cell--dim .portrait__shape-name {
  color: var(--text-tertiary);
}

/* ── 主体：维度轨 + 条目流 ─────────────────── */
.portrait__body {
  display: grid;
  grid-template-columns: 208px 1fr;
  gap: 32px;
  padding-top: 18px;
}
.portrait__rail {
  position: sticky;
  top: 12px;
  align-self: start;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.portrait__rail-title {
  margin: 0 0 6px 10px;
  font-size: 11px;
  letter-spacing: 2px;
  color: var(--text-tertiary);
}
.portrait__rail-link {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 8px;
  text-decoration: none;
  font-size: 12px;
  color: var(--text-secondary);
  border-left: 2px solid transparent;
  transition: background 0.15s ease, color 0.15s ease;
}
.portrait__rail-link:hover {
  background: var(--bg-subtle);
  color: var(--text-primary);
}
.portrait__rail-link--active {
  background: var(--brand-area);
  color: var(--brand-text);
  border-left-color: var(--brand-solid);
}
.portrait__rail-code {
  font-weight: 700;
  font-size: 11px;
}
.portrait__rail-count {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-tertiary);
}
.portrait__rail-legend {
  margin-top: 18px;
  padding: 10px 12px;
  border: 1px dashed var(--border-default);
  border-radius: 10px;
}
.portrait__rail-legend-title {
  margin: 0 0 6px;
  font-size: 11px;
  color: var(--text-tertiary);
}
.portrait__rail-legend-item {
  margin: 0 0 4px;
  font-size: 11px;
  color: var(--text-tertiary);
  display: flex;
  align-items: center;
  gap: 6px;
}
.portrait__legend-chip {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--level-l3);
}
.portrait__legend-star {
  color: var(--star-accent);
  font-size: 12px;
}

/* ── 条目组与条目 ─────────────────────────── */
.portrait__group {
  scroll-margin-top: 16px;
  margin-bottom: 30px;
}
.portrait__group-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-default);
  margin-bottom: 4px;
}
.portrait__group-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}
.portrait__group-dim {
  font-size: 11px;
  color: var(--text-tertiary);
}
.entry {
  display: grid;
  grid-template-columns: minmax(220px, 2fr) 3fr;
  gap: 20px;
  padding: 16px 4px 14px 14px;
  border-bottom: 1px solid var(--border-default);
  border-left: 2px solid transparent;
  transition: border-color 0.15s ease;
}
.entry:hover {
  border-left-color: var(--border-strong);
}
.entry--decay {
  border-left-color: var(--warning);
}
.entry--l0 {
  border-left-style: dashed;
  border-left-color: var(--border-strong);
}
.entry--blank .entry__name,
.entry--blank {
  color: var(--text-tertiary);
}
.entry__head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.entry__name {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.entry--l0 .entry__name,
.entry--blank .entry__name {
  font-weight: 400;
}
.entry__decay {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--warning);
}
.entry__note {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--text-tertiary);
}
.entry__cta {
  color: var(--brand-text);
  text-decoration: none;
}
.entry__data {
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-left: 1px solid var(--border-default);
  padding-left: 20px;
}
.entry__meta {
  margin: 0;
  font-size: 11px;
  color: var(--text-tertiary);
}

@media (max-width: 960px) {
  .portrait__body {
    grid-template-columns: 1fr;
  }
  .portrait__rail {
    position: static;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 6px;
  }
  .portrait__rail-legend {
    display: none;
  }
  .portrait__shape {
    grid-template-columns: repeat(2, 1fr);
  }
  .entry {
    grid-template-columns: 1fr;
  }
  .entry__data {
    border-left: none;
    padding-left: 0;
    border-top: 1px solid var(--border-default);
    padding-top: 12px;
  }
}
</style>
