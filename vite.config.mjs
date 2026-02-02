import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import svgr from 'vite-plugin-svgr';
import { rsxVitePlugin } from '@lms5400/babel-plugin-rsx/vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    rsxVitePlugin(),
    react({
      include: /\.(jsx|tsx|rsx)$/,
    }),
    svgr(),
  ],
  resolve: {
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.rsx'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  root: './src',
  publicDir: '../public',
  base: './',
  build: {
    outDir: '../build',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
  },
});
