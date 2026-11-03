import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const port = Number(env.VITE_PORT) || 2324;
  const apiTarget = env.VITE_API_TARGET || 'http://localhost:3000';
  const storageTarget = env.VITE_STORAGE_TARGET || 'http://localhost:9000';

  return {
    // Test harnesses use Vite's default cache; keep the live app's dependencies separate.
    cacheDir: 'node_modules/.vite-app',
    plugins: [react()],
    server: {
      port,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/__private-storage': {
          target: storageTarget,
          changeOrigin: true,
          rewrite: (url) => url.replace(/^\/__private-storage/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (request) => {
              // App cookies/tokens must never reach object storage, even on image/video GET.
              request.removeHeader('cookie');
              request.removeHeader('authorization');
              request.removeHeader('origin');
            });
          },
        },
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@messages": path.resolve(__dirname, "./messages"),
      },
    },
  };
});

