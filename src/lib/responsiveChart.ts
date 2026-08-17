import type { EChartsOption } from 'echarts';

export const COMPACT_CHART_MAX_WIDTH = 560;

type LooseOption = Record<string, any>;

function mapCollection(value: unknown, transform: (item: LooseOption) => LooseOption) {
  if (Array.isArray(value)) return value.map((item) => transform((item ?? {}) as LooseOption));
  if (value && typeof value === 'object') return transform(value as LooseOption);
  return value;
}

function collectionItems(value: unknown): LooseOption[] {
  if (Array.isArray(value)) return value.filter((item) => item && typeof item === 'object') as LooseOption[];
  if (value && typeof value === 'object') return [value as LooseOption];
  return [];
}

export function responsiveChartOption(option: EChartsOption, width: number): EChartsOption {
  if (!Number.isFinite(width) || width <= 0 || width > COMPACT_CHART_MAX_WIDTH) return option;

  const source = option as LooseOption;
  const output: LooseOption = { ...source };
  const hasLegend = Boolean(source.legend);
  const hasAxes = Boolean(source.xAxis || source.yAxis);
  const hasDataZoom = Boolean(source.dataZoom) && (!Array.isArray(source.dataZoom) || source.dataZoom.length > 0);
  const yAxes = collectionItems(source.yAxis);
  const categoryY = yAxes.some((axis) => axis.type === 'category');

  if (source.tooltip && typeof source.tooltip === 'object' && !Array.isArray(source.tooltip)) {
    output.tooltip = { ...source.tooltip, confine: true };
  }

  if (source.legend) {
    output.legend = mapCollection(source.legend, (legend) => ({
      ...legend,
      type: 'scroll',
      top: 4,
      left: 8,
      right: 8,
      itemWidth: 12,
      itemHeight: 7,
      itemGap: 8,
      pageIconSize: 9,
      textStyle: { ...(legend.textStyle ?? {}), fontSize: 10 },
    }));
  }

  if (hasAxes) {
    const gridDefaults = categoryY
      ? { left: 112, right: 14, top: hasLegend ? 46 : 18, bottom: hasDataZoom ? 64 : 38, containLabel: false }
      : { left: 46, right: 38, top: hasLegend ? 52 : 20, bottom: hasDataZoom ? 72 : 46, containLabel: false };

    if (Array.isArray(source.grid)) {
      output.grid = source.grid.map((grid: LooseOption) => ({ ...gridDefaults, ...(grid ?? {}), ...gridDefaults }));
    } else {
      output.grid = { ...(source.grid ?? {}), ...gridDefaults };
    }

    output.xAxis = mapCollection(source.xAxis, (axis) => ({
      ...axis,
      name: '',
      nameGap: 0,
      axisLabel: {
        ...(axis.axisLabel ?? {}),
        fontSize: 10,
        hideOverlap: true,
        margin: 8,
      },
    }));

    output.yAxis = mapCollection(source.yAxis, (axis) => ({
      ...axis,
      name: '',
      nameGap: 0,
      axisLabel: {
        ...(axis.axisLabel ?? {}),
        fontSize: 10,
        hideOverlap: true,
        margin: 7,
        ...(axis.type === 'category' ? { width: 96, overflow: 'truncate' } : {}),
      },
    }));
  }

  return output as EChartsOption;
}
