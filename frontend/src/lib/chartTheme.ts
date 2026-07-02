import { useTheme } from '@/hooks/useTheme'

// Chart.js draws to a canvas and can't read CSS variables, so charts pull their
// grid / axis-text / segment-border colours from here. Components include the
// returned `resolved` in their options `useMemo` deps so the chart recomputes and
// redraws when the theme flips.
export interface ChartColors {
  grid: string
  text: string
  segmentBorder: string
  resolved: 'light' | 'dark'
}

export function chartColorsFor(resolved: 'light' | 'dark'): ChartColors {
  return resolved === 'dark'
    ? { grid: 'rgba(255,255,255,0.09)', text: '#9BA8B9', segmentBorder: '#16202E', resolved }
    : { grid: '#F1F5F9', text: '#6B6E73', segmentBorder: '#FFFFFF', resolved }
}

export function useChartColors(): ChartColors {
  const { resolved } = useTheme()
  return chartColorsFor(resolved)
}
