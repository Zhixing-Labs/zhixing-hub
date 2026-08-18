<script setup lang="ts">
// 演示态横幅：fixtures 数据的诚实标注（真实数据随证据模块接入）
</script>

<template>
  <div class="demo-banner" role="note">
    <span class="tag">演示数据</span>
    <span>虚构学员「林晓」的 12 个月成长轨迹 —— 真实成长数据随证据模块接入（Q13 / R13）。</span>
  </div>
</template>

<style scoped>
.demo-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border: 1px dashed var(--warning);
  border-radius: 8px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 18px;
}

.tag {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--warning);
  color: #ffffff;
  font-size: 12px;
  font-weight: 500;
}
</style>
