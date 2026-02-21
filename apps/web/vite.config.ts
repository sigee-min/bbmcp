import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const gatewayTarget = process.env.ASHFOX_GATEWAY_PROXY_TARGET || 'http://127.0.0.1:8787';
const gatewayUnavailablePayload = JSON.stringify({
  ok: false,
  code: 'gateway_unavailable',
  message: '백엔드 게이트웨이에 연결할 수 없습니다. gateway 서버를 실행한 뒤 다시 시도해 주세요.'
});

const createGatewayProxy = () => ({
  target: gatewayTarget,
  changeOrigin: true,
  configure(proxy) {
    proxy.on('error', (_error, _req, response) => {
      if (!response || typeof response.writeHead !== 'function' || typeof response.end !== 'function') {
        return;
      }
      if (response.headersSent) {
        response.end();
        return;
      }
      response.writeHead(503, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store'
      });
      response.end(gatewayUnavailablePayload);
    });
  }
});

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 8686,
    proxy: {
      '/api': createGatewayProxy(),
      '/mcp': createGatewayProxy(),
      '/metrics': createGatewayProxy()
    }
  },
  preview: {
    host: '0.0.0.0',
    port: 8686
  }
});
