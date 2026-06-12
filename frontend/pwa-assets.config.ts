import {
  defineConfig,
  minimal2023Preset,
} from '@vite-pwa/assets-generator/config'

// Generates the full PWA icon set from a single source SVG.
// Source: public/favicon.svg (the Wallet360 brand mark). To rebrand, replace
// that SVG and re-run:  npm run generate-pwa-assets -w frontend
export default defineConfig({
  headLinkOptions: {
    preset: '2023',
  },
  preset: minimal2023Preset,
  images: ['public/favicon.svg'],
})
