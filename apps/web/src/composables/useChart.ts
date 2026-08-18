import { onBeforeUnmount, onMounted, type Ref } from 'vue';
import { echarts, type EChartsCoreOption } from '@/lib/echarts';

/**
 * 图表装配：挂载初始化、跟随皮肤类重渲、跟随容器尺寸 resize、卸载销毁。
 * 选项一律由 buildOption 现算（内部读 cssVar，皮肤切换后取到新值）。
 */
export function useChart(container: Ref<HTMLElement | null>, buildOption: () => EChartsCoreOption) {
  let chart: echarts.ECharts | null = null;
  let themeObserver: MutationObserver | null = null;
  let resizeObserver: ResizeObserver | null = null;

  function render(): void {
    if (!container.value) return;
    if (!chart) chart = echarts.init(container.value);
    chart.setOption(buildOption(), true);
  }

  onMounted(() => {
    render();
    resizeObserver = new ResizeObserver(() => chart?.resize());
    if (container.value) resizeObserver.observe(container.value);
    themeObserver = new MutationObserver(render);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
  });

  onBeforeUnmount(() => {
    themeObserver?.disconnect();
    resizeObserver?.disconnect();
    chart?.dispose();
    chart = null;
  });

  return { render };
}
