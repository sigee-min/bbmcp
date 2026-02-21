#!/usr/bin/env node
import process from 'node:process';

const defaultGatewayTarget = 'http://127.0.0.1:8787';
const target = process.env.ASHFOX_GATEWAY_PROXY_TARGET || defaultGatewayTarget;
const skipCheck = process.env.ASHFOX_WEB_DEV_SKIP_GATEWAY_CHECK === '1';
const timeoutMs = Number.parseInt(process.env.ASHFOX_WEB_DEV_GATEWAY_TIMEOUT_MS || '1500', 10);

if (skipCheck) {
  console.log('[web-dev] gateway preflight skipped (ASHFOX_WEB_DEV_SKIP_GATEWAY_CHECK=1)');
  process.exit(0);
}

const healthUrl = new URL('/api/health', target).toString();
const controller = new AbortController();
const timeout = setTimeout(() => {
  controller.abort();
}, Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 1500);

try {
  const response = await fetch(healthUrl, {
    method: 'GET',
    cache: 'no-store',
    signal: controller.signal
  });

  if (!response.ok) {
    console.error(`[web-dev] gateway preflight failed: ${healthUrl} -> ${response.status}`);
    console.error(
      '[web-dev] gateway를 먼저 실행하세요 (`npm run dev` 또는 `npm run dev:gateway`). 우회하려면 ASHFOX_WEB_DEV_SKIP_GATEWAY_CHECK=1'
    );
    process.exit(1);
  }

  console.log(`[web-dev] gateway preflight ok: ${healthUrl}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[web-dev] gateway preflight failed: ${healthUrl} (${message})`);
  console.error(
    '[web-dev] gateway를 먼저 실행하세요 (`npm run dev` 또는 `npm run dev:gateway`). 우회하려면 ASHFOX_WEB_DEV_SKIP_GATEWAY_CHECK=1'
  );
  process.exit(1);
} finally {
  clearTimeout(timeout);
}
