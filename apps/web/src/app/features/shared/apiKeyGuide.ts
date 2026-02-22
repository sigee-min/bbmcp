export type ApiKeyGuidePlatform = 'codex' | 'claude' | 'gemini';

export const resolveMcpEndpoint = (): string => {
  if (typeof window === 'undefined' || !window.location?.origin) {
    return '/mcp';
  }
  return `${window.location.origin}/mcp`;
};

export const buildApiKeyGuideTemplate = (platform: ApiKeyGuidePlatform, mcpEndpoint: string): string => {
  if (platform === 'codex') {
    return `[mcp_servers.ashfox.env]
ASHFOX_MCP_ENDPOINT = "${mcpEndpoint}"
ASHFOX_MCP_API_KEY = "<API_KEY>"`;
  }
  if (platform === 'claude') {
    return `"env": {
  "ASHFOX_MCP_ENDPOINT": "${mcpEndpoint}",
  "ASHFOX_MCP_API_KEY": "<API_KEY>"
}`;
  }
  return `ASHFOX_MCP_ENDPOINT=${mcpEndpoint}
ASHFOX_MCP_API_KEY=<API_KEY>`;
};

export const getApiKeyGuideTitle = (platform: ApiKeyGuidePlatform): string =>
  platform === 'codex' ? 'Codex' : platform === 'claude' ? 'Claude' : 'Gemini';

export const getApiKeyGuideSubtitle = (platform: ApiKeyGuidePlatform): string =>
  platform === 'codex'
    ? '~/.codex/config.toml 의 ashfox MCP 서버 env 블록 예시'
    : platform === 'claude'
      ? 'Claude MCP 서버 설정의 env 블록 예시'
      : 'Gemini MCP 서버 실행 환경 변수 예시';

export const copyTextToClipboard = async (value: string): Promise<void> => {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    return;
  }
  await navigator.clipboard.writeText(value);
};
