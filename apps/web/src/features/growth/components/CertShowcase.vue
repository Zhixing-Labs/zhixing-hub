<script setup lang="ts">
// 证书精选（C15 证面冻结字段口径）——证面不含任何能力等级（《07》第 3.5 节）
export interface DemoCertificate {
  code: string;
  projectName: string;
  enterprise: string;
  college: string;
  period: string;
  issuedAt: string;
}

defineProps<{
  certificates: DemoCertificate[];
}>();
</script>

<template>
  <ul class="cert-grid">
    <li v-for="cert in certificates" :key="cert.code" class="cert-card">
      <p class="cert-name">{{ cert.projectName }}</p>
      <dl class="cert-fields">
        <div><dt>证书编号</dt><dd class="mono">{{ cert.code }}</dd></div>
        <div><dt>发证企业</dt><dd>{{ cert.enterprise }}</dd></div>
        <div><dt>协作学院</dt><dd>{{ cert.college }}</dd></div>
        <div><dt>项目周期</dt><dd>{{ cert.period }}</dd></div>
        <div><dt>发证日期</dt><dd>{{ cert.issuedAt }}</dd></div>
      </dl>
      <p class="cert-actions">
        <span class="link disabled" title="演示态——证书验证入口随 Identity/证书模块接入">公共验证</span> ·
        <span class="link disabled" title="演示态——PDF 下载随证书模块接入">PDF 下载</span>
      </p>
    </li>
  </ul>
</template>

<style scoped>
.cert-grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
}

.cert-card {
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--bg-surface);
  padding: 14px 16px;
}

.cert-name {
  margin: 0 0 8px;
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 600;
}

.cert-fields {
  margin: 0;
  display: grid;
  gap: 3px;
}

.cert-fields div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.cert-fields dt {
  color: var(--text-tertiary);
  font-size: 12px;
}

.cert-fields dd {
  margin: 0;
  color: var(--text-secondary);
  font-size: 12px;
  text-align: right;
}

.mono {
  font-family: 'RobotoMono', Consolas, monospace;
}

.cert-actions {
  margin: 10px 0 0;
  font-size: 12px;
}

.link {
  color: var(--brand-text);
}

.link.disabled {
  color: var(--text-tertiary);
  text-decoration: line-through;
  text-decoration-color: var(--border-strong);
}
</style>
