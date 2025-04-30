import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill'


// https://vite.dev/config/
export default defineConfig({
  optimizeDeps: {
    exclude: ['bson'],
    esbuildOptions: {
      target: 'esnext', // ensure esbuild uses a modern target
      define: {
        global: 'globalThis'
      },
      plugins: [
        NodeGlobalsPolyfillPlugin({
          buffer: true
        })
      ]
    }
  },
  build: {
    target: 'esnext', // build for modern browsers supporting top-level await,
    rollupOptions: {
      output: {
        entryFileNames: '[name].js',
        assetFileNames: '[name][extname]'
      }
    }
  },
  plugins: [react(), tailwindcss(),],
  base: './',
  server: {
    port: 3020
  }
})
