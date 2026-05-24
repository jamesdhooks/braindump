import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@bd/claw': path.resolve(__dirname, 'packages/claw/protocol.ts'),
      '@bd/core': path.resolve(__dirname, 'packages/core/index.ts')
    }
  },
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        onstart({ startup }) {
          // Some shells/tools leak this flag, which makes Electron run as plain Node.
          const env = { ...process.env };
          delete env.ELECTRON_RUN_AS_NODE;
          startup(['.', '--no-sandbox'], { env });
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron', 'electron-store', 'keytar']
            }
          }
        }
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            outDir: 'dist-electron'
          }
        }
      }
    ]),
    renderer()
  ],
  server: {
    port: 9173,
    strictPort: true
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        quickCapture: path.resolve(__dirname, 'quick-capture.html')
      }
    }
  }
});
