import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { EChartsOption, ECElementEvent } from 'echarts';

export function EChart({
  option,
  height = 360,
  onClick,
  ariaLabel = 'Interactive analytical chart',
}: {
  option: EChartsOption;
  height?: number;
  onClick?: (params: ECElementEvent) => void;
  ariaLabel?: string;
}) {
  const elementRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const chart = echarts.init(element, undefined, { renderer: 'canvas' });
    chartRef.current = chart;
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(element);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true, lazyUpdate: true });
  }, [option]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !onClick) return;
    chart.on('click', onClick);
    return () => { chart.off('click', onClick); };
  }, [onClick]);

  return <div ref={elementRef} style={{ width: '100%', height }} role="img" aria-label={ariaLabel} />;
}
