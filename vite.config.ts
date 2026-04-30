// noinspection JSUnusedGlobalSymbols

import {defineConfig, loadEnv} from 'vite';
import { resolve } from 'path';
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';
import {svgSpritePlugin} from './svg-sprite-plugin';
import analyze from 'rollup-plugin-analyzer';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())

  // expose .env as process.env instead of import.meta since jest does not import meta yet
  const envWithProcessPrefix = Object.entries(env).reduce(
    (prev, [key, val]) => {
      return {
        ...prev,
        ['process.env.' + key]: `"${val}"`,
      }
    },
    {},
  );

  return {
    plugins: [vue(), vuetify({autoImport: true}), svgSpritePlugin(resolve(__dirname, 'src/assets/icons')), analyze()],
    base: './',
    server: {
    host: '0.0.0.0',
      port: 8080
    },
    resolve: {
      alias: [
        {
          find: '@',
          replacement: resolve(__dirname, 'src')
        }
      ]
    },
    build: {
      chunkSizeWarningLimit: 600,
      assetsDir: 'live-atlas/assets'
    },
    define: envWithProcessPrefix,
    test: {
      globals: true,
      environment: 'jsdom',
    },
  }
});
