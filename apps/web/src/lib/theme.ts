/** 读取语义令牌的当前计算值（双皮肤切换后随重渲生效） */
export function cssVar(name: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || '#888888';
}
