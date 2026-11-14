import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    transparent: { ...minimal2023Preset.transparent, favicons: [[48, 'favicon.ico']] },
    maskable: { ...minimal2023Preset.maskable, padding: 0.2, resizeOptions: { background: '#0B0B0F' } },
    apple: { ...minimal2023Preset.apple, padding: 0.2, resizeOptions: { background: '#0B0B0F' } },
  },
  images: ['public/icons/source.svg'],
});
