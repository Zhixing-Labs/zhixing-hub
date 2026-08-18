// ECharts 按需引入（《11》第 2 节：平台唯一图表库；禁止雷达仪表等反面形态除外——
// R13 解禁覆盖率雷达与星值仪表，仍禁能力雷达与无清单合成分）。
import * as echarts from 'echarts/core';
import {
  CalendarComponent,
  GridComponent,
  RadarComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import { GaugeChart, HeatmapChart, LineChart, RadarChart } from 'echarts/charts';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  CalendarComponent,
  GridComponent,
  RadarComponent,
  TooltipComponent,
  VisualMapComponent,
  GaugeChart,
  HeatmapChart,
  LineChart,
  RadarChart,
  CanvasRenderer,
]);

export { echarts };
export type EChartsCoreOption = echarts.EChartsCoreOption;
