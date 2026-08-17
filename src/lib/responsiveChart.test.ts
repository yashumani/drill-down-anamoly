import { describe, expect, it } from 'vitest';
import type { EChartsOption } from 'echarts';
import { responsiveChartOption } from './responsiveChart';

describe('responsive ECharts option', () => {
  it('keeps the desktop option unchanged above the compact breakpoint', () => {
    const option: EChartsOption = { xAxis: { type: 'value', name: 'Impact' }, yAxis: { type: 'category' } };
    expect(responsiveChartOption(option, 900)).toBe(option);
  });

  it('confines tooltips, scrolls legends, and trims category-axis margins on phones', () => {
    const option: EChartsOption = {
      tooltip: { trigger: 'axis' },
      legend: { data: ['Actual', 'Plan', 'Impact'] },
      grid: { left: 170, right: 70 },
      xAxis: { type: 'value', name: 'Business impact' },
      yAxis: { type: 'category', data: ['Long category label'] },
      series: [],
    };
    const output = responsiveChartOption(option, 390) as Record<string, any>;
    expect(output.tooltip.confine).toBe(true);
    expect(output.legend.type).toBe('scroll');
    expect(output.grid.left).toBe(112);
    expect(output.grid.right).toBe(14);
    expect(output.xAxis.name).toBe('');
    expect(output.yAxis.axisLabel.overflow).toBe('truncate');
  });
});
