import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Vite 설정 — React 플러그인 + 개발 서버(5173) + /api 프록시(선택).
// VITE_API_BASE_URL이 설정되면 /api 요청을 백엔드로 프록시한다.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiBase = env.VITE_API_BASE_URL || 'http://localhost:3000';

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        // 프론트가 상대경로 /api로 호출할 경우 백엔드로 전달.
        '/api': {
          target: apiBase,
          changeOrigin: true,
        },
      },
    },
  };
});
