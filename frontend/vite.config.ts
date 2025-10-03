import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill'


// https://vite.dev/config/
export default defineConfig(({ command }) => {
  const isDev = command === 'serve'
  const base = isDev ? undefined : './'
  return {
    appType: 'spa',
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
      target: 'esnext',
      rollupOptions: {
        output: {
          entryFileNames: '[name].js',
          assetFileNames: '[name][extname]'
        }
      }
    },
    plugins: [react(), tailwindcss(),],
    base,
    server: {
      host: '127.0.0.1',
      port: 3020,
      strictPort: true,
      allowedHosts: ['wetpear.com', 'localhost', '127.0.0.1'],
      fs: {
        strict:true,
        allow: ['.'],
        deny: ['.env', '.env.*', '**/.DS_Store']
      }
    }
  }
})
