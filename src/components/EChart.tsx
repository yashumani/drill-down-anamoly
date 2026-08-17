import { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts';
import type { EChartsOption, ECElementEvent } from 'echarts';
import { COMPACT_CHART_MAX_WIDTH, responsiveChartOption } from '../lib/responsiveChart';

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
  const [containerWidth, setContainerWidth] = useState(0);
  const compact = containerWidth > 0 && containerWidth <= COMPACT_CHART_MAX_WIDTH;
  const responsiveOption = useMemo(() => responsiveChartOption(option, containerWidth), [option, containerWidth]);
  const responsiveHeight = compact ? Math.min(height, 360) : height;

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const chart = echarts.init(element, undefined, { renderer: 'canvas' });
    chartRef.current = chart;
    setContainerWidth(element.clientWidth);
    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width ?? element.clientWidth;
      setContainerWidth((current) => Math.abs(current - nextWidth) >= 1 ? nextWidth : current);
      chart.resize();
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(responsiveOption, { notMerge: true, lazyUpdate: true });
  }, [responsiveOption]);

  useEffect(() => {
    chartRef.current?.resize();
  }, [responsiveHeight]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !onClick) return;
    chart.on('click', onClick);
    return () => { chart.off('click', onClick); };
  }, [onClick]);

  return <div
    ref={elementRef}
    className={compact ? 'echart echart-compact' : 'echart'}
    style={{ width: '100%', height: responsiveHeight }}
    role="img"
    aria-label={ariaLabel}
  />;
}
