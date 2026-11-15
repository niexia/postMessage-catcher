import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  browser: 'chrome',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'postMessage-catcher',
    description:
      'Capture, inspect and audit postMessage traffic between windows, iframes and workers.',
    permissions: ['storage'],
    minimum_chrome_version: '114',
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
    action: {
      default_title: 'postMessage-catcher',
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
        128: 'icon/128.png',
      },
    },
    homepage_url: 'https://github.com/niexia/postMessage-catcher',
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
