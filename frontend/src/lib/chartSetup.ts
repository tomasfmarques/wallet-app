// ── One-time Chart.js registration ────────────────────────────────
// Chart.js v4 uses tree-shaken modular registration. Import this file ONCE
// (from main.tsx) so all charts in the app have the components they need.

import {
  Chart,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'

Chart.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,    // for budget timeline bars
  ArcElement,    // for category donuts
  Tooltip,
  Legend,
  Filler,
)

// Global defaults — match the design's typography + colours
Chart.defaults.font.family = "'Outfit', sans-serif"
Chart.defaults.font.size = 12
Chart.defaults.color = '#64748B'
Chart.defaults.plugins.tooltip.backgroundColor = '#0B1120'
Chart.defaults.plugins.tooltip.padding = 10
Chart.defaults.plugins.tooltip.cornerRadius = 8
Chart.defaults.plugins.tooltip.titleFont = { weight: 600, size: 12 }
Chart.defaults.plugins.tooltip.bodyFont = { size: 12 }
