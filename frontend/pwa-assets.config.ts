import { defineConfig } from '@vite-pwa/assets-generator/config'

// Generates the full PWA icon set from a single source SVG.
// Source: public/favicon.svg (the Wallet360 "Converge" app icon — a navy tile,
// already a full square). To rebrand, replace that SVG and re-run:
//   npm run generate-pwa-assets -w frontend
//
// We override the minimal-2023 preset's defaults: the stock maskable/apple
// icons add 0.3 padding on a WHITE background (a white border + a shrunken
// logo on the installed app). Since our source is itself the finished tile,
// we drop the padding and fill any remaining area with the brand navy so the
// logo takes the whole icon edge-to-edge.
const NAVY = '#0A1A2C'
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    transparent: {
      sizes: [64, 192, 512],
      favicons: [[48, 'favicon.ico']],
      padding: 0,
    },
    maskable: {
      sizes: [512],
      padding: 0,
      resizeOptions: { background: NAVY },
    },
    apple: {
      sizes: [180],
      padding: 0,
      resizeOptions: { background: NAVY },
    },
  },
  images: ['public/favicon.svg'],
})
