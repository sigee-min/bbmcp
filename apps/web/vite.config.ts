import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const gatewayTarget = process.env.ASHFOX_GATEWAY_PROXY_TARGET || 'http://127.0.0.1:8787';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 8686,
    proxy: {
      '/api': gatewayTarget,
      '/mcp': gatewayTarget,
      '/metrics': gatewayTarget
    }
  },
  preview: {
    host: '0.0.0.0',
    port: 8686
  }
});
