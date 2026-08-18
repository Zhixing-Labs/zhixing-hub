<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const title = computed(() => (route.meta.title as string | undefined) ?? '知行工坊');
</script>

<template>
  <main class="page">
    <p class="brand">知行工坊 Zhixing Hub</p>
    <h1>{{ title }}</h1>
    <p class="hint">页面骨架占位 —— 业务页面随对应模块按《09》页面清单交付。</p>
  </main>
</template>

<style scoped>
.page {
  min-height: 100vh;
  padding: 64px;
  background: var(--bg-canvas);
  color: var(--text-primary);
  font-family: Inter, 'PingFang SC', -apple-system, 'Segoe UI', Roboto, sans-serif;
}

.brand {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--brand-text);
}

h1 {
  margin: 0 0 12px;
  font-size: 28px;
}

.hint {
  margin: 0;
  color: var(--text-secondary);
}
</style>
