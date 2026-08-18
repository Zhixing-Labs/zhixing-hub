import { createRouter, createWebHistory } from 'vue-router';
import Placeholder from '@/pages/Placeholder.vue';

// 路由分区按《11》第 4.1 节：公共 / 认证 / 验证 / 五端工作台 / 规范中心。
// 各端按路由懒加载；页面清单以《09》为准，随业务模块逐阶段落位。
const routes = [
  { path: '/', name: 'home', component: Placeholder, meta: { title: '介绍首页' } },
  { path: '/auth/:pathMatch(.*)*', name: 'auth', component: Placeholder, meta: { title: '登录与注册' } },
  { path: '/verify/:pathMatch(.*)*', name: 'verify', component: Placeholder, meta: { title: '证书验证与简历分享' } },
  { path: '/platform/:pathMatch(.*)*', name: 'platform', component: Placeholder, meta: { title: '平台工作台' } },
  { path: '/student/growth', name: 'student-growth', component: () => import('@/features/growth/GrowthPage.vue'), meta: { title: '成长时间线' } },
  { path: '/student/portrait', name: 'student-portrait', component: () => import('@/features/portrait/PortraitPage.vue'), meta: { title: '我的画像' } },
  { path: '/student/:pathMatch(.*)*', name: 'student', component: Placeholder, meta: { title: '学员工作台' } },
  { path: '/university/:pathMatch(.*)*', name: 'university', component: Placeholder, meta: { title: '高校工作台' } },
  { path: '/enterprise/:pathMatch(.*)*', name: 'enterprise', component: Placeholder, meta: { title: '企业工作台' } },
  { path: '/government/:pathMatch(.*)*', name: 'government', component: Placeholder, meta: { title: '政务工作台' } },
  { path: '/docs/:pathMatch(.*)*', name: 'docs', component: Placeholder, meta: { title: '规范中心' } },
];

export default createRouter({
  history: createWebHistory(),
  routes,
});
