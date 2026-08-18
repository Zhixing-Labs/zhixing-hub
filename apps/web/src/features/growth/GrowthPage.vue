<script setup lang="ts">
// 成长时间线页（《09》3.21，Q13 / R13）——演示数据驱动；真实数据随证据模块接入。
// 星级一律由 @zhixing/shared 规则函数从声明现算，演示页与未来后端派生共用同一规则。
import { computed } from 'vue';
import { entryStarPoints, starLevel } from '@zhixing/shared';
import DemoBanner from './components/DemoBanner.vue';
import StarGauge from './components/StarGauge.vue';
import ActivityHeatmap from './components/ActivityHeatmap.vue';
import GrowthTimeline from './components/GrowthTimeline.vue';
import CoverageRadar from './components/CoverageRadar.vue';
import DimensionLightup from './components/DimensionLightup.vue';
import StrengthStackBar from './components/StrengthStackBar.vue';
import BadgeWall from './components/BadgeWall.vue';
import CertShowcase from './components/CertShowcase.vue';
import {
  DEMO_BADGES_EARNED,
  DEMO_BADGES_PROGRESS,
  DEMO_CERTIFICATES,
  DEMO_CLAIMS,
  DEMO_COVERAGE,
  DEMO_DIMENSIONS,
  DEMO_HEATMAP,
  DEMO_MONTHLY_L1PLUS,
  DEMO_STUDENT,
  DEMO_STAR_BREAKDOWN,
  DEMO_TIMELINE,
  DEMO_WINDOW,
  FOCUS_ENTRY,
} from './fixtures';

const totalPoints = computed(() => entryStarPoints(DEMO_CLAIMS));
const totalLevel = computed(() => starLevel(totalPoints.value));

const focusClaims = computed(() =>
  DEMO_CLAIMS.filter((claim) => claim.entryId === FOCUS_ENTRY.entryId).map(({ envelopeId, entryId, strength, issuedAt, source }) => ({
    envelopeId,
    entryId,
    strength,
    issuedAt,
    source,
  })),
);
</script>

<template>
  <main class="page">
    <DemoBanner />

    <header class="page-head">
      <div>
        <h1>成长时间线</h1>
        <p class="sub">{{ DEMO_STUDENT.name }} · {{ DEMO_STUDENT.grade }} · {{ DEMO_STUDENT.target }}</p>
      </div>
    </header>

    <section class="card top-band">
      <StarGauge :points="totalPoints" :level="totalLevel" :breakdown="DEMO_STAR_BREAKDOWN" />
      <div class="divider"></div>
      <ActivityHeatmap :days="DEMO_HEATMAP" :range="DEMO_WINDOW" />
    </section>

    <div class="middle">
      <section class="card timeline-card">
        <h2>时间线</h2>
        <GrowthTimeline :events="DEMO_TIMELINE" />
      </section>
      <div class="side">
        <section class="card">
          <h2>对目标标准的覆盖</h2>
          <CoverageRadar :coverage="DEMO_COVERAGE" />
        </section>
        <section class="card">
          <h2>五维点亮与成长阶梯</h2>
          <DimensionLightup :dims="DEMO_DIMENSIONS" :monthly="DEMO_MONTHLY_L1PLUS" />
        </section>
        <section class="card">
          <h2>条目星级示例</h2>
          <StrengthStackBar :entry-name="FOCUS_ENTRY.entryName" :claims="focusClaims" />
        </section>
      </div>
    </div>

    <section class="card">
      <h2>勋章墙</h2>
      <BadgeWall :earned="DEMO_BADGES_EARNED" :progress="DEMO_BADGES_PROGRESS" />
    </section>

    <section class="card">
      <h2>证书精选</h2>
      <CertShowcase :certificates="DEMO_CERTIFICATES" />
      <p class="footnote">完整证书墙见「我的证书」（3.11）；证面字段冻结清单不含任何能力等级。</p>
    </section>
  </main>
</template>

<style scoped>
.page {
  max-width: 1280px;
  margin: 0 auto;
  padding: 24px;
  display: grid;
  gap: 16px;
}

.page-head h1 {
  margin: 0;
  font-size: 28px;
  color: var(--text-primary);
}

.page-head .sub {
  margin: 4px 0 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.card {
  border: 1px solid var(--border-default);
  border-radius: 12px;
  background: var(--bg-surface);
  padding: 16px 20px;
}

.card h2 {
  margin: 0 0 12px;
  font-size: 18px;
  color: var(--text-primary);
}

.top-band {
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 20px;
  align-items: center;
}

.divider {
  width: 1px;
  align-self: stretch;
  background: var(--border-default);
}

.middle {
  display: grid;
  grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
  gap: 16px;
  align-items: start;
}

.side {
  display: grid;
  gap: 16px;
}

.footnote {
  margin: 12px 0 0;
  color: var(--text-tertiary);
  font-size: 12px;
}

@media (max-width: 1280px) {
  .top-band {
    grid-template-columns: 1fr;
  }

  .divider {
    display: none;
  }

  .middle {
    grid-template-columns: 1fr;
  }
}
</style>
