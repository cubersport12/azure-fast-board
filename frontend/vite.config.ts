import { rmSync } from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { electronSimple } from 'vite-plugin-electron/multi-env'
import { notBundle } from 'vite-plugin-electron/plugin'
import pkg from './package.json'

const external = Object.keys(
  'dependencies' in pkg ? (pkg.dependencies as Record<string, string>) : {},
)

/** Dev proxy target for notifications-api (Azure Service Hooks → WebSocket fan-out). */
const notificationsApiTarget =
  process.env.NOTIFICATIONS_API_PROXY_TARGET?.trim() || 'http://172.22.91.47:8787'

export default defineConfig(({ command }) => {
  rmSync('dist-electron', { recursive: true, force: true })

  const isServe = command === 'serve'
  const isBuild = command === 'build'
  const sourcemap = isServe || !!process.env.VSCODE_DEBUG

  return {
    resolve: {
      alias: {
        '@': path.join(__dirname, 'src'),
        '@shared': path.join(__dirname, 'shared'),
      },
    },
    server: {
      proxy: {
        // http://localhost:<vite>/notifications-api/... → http://172.22.91.47:8787/...
        '/notifications-api': {
          target: notificationsApiTarget,
          changeOrigin: true,
          ws: true,
          rewrite: (requestPath) => requestPath.replace(/^\/notifications-api/, ''),
        },
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      electronSimple({
        main: {
          input: 'electron/main/index.ts',
          plugins: [notBundle()],
          options: {
            build: {
              sourcemap,
              minify: isBuild,
              outDir: 'dist-electron/main',
              rolldownOptions: {
                external: [...external, 'electron'],
              },
            },
          },
        },
        preload: {
          input: 'electron/preload/index.ts',
          options: {
            build: {
              sourcemap: sourcemap ? 'inline' : undefined,
              minify: isBuild,
              outDir: 'dist-electron/preload',
              rolldownOptions: {
                external: ['electron'],
                output: {
                  format: 'cjs',
                  entryFileNames: 'index.cjs',
                  exports: 'auto',
                },
              },
            },
          },
        },
      }),
    ],
    clearScreen: false,
  }
})
