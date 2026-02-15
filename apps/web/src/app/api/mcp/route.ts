import { NextResponse } from 'next/server';

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

const DEFAULT_GATEWAY_URL = 'http://127.0.0.1:8790/mcp';

const resolveGatewayUrl = (): string => {
  const raw = process.env.ASHFOX_GATEWAY_URL;
  if (!raw || raw.trim().length === 0) {
    return DEFAULT_GATEWAY_URL;
  }
  return raw.trim();
};

const jsonRpcError = (id: string | number | null | undefined, code: number, message: string) => ({
  jsonrpc: '2.0' as const,
  id: id ?? null,
  error: { code, message }
});

export async function POST(req: Request) {
  let payload: JsonRpcRequest | null = null;
  try {
    payload = (await req.json()) as JsonRpcRequest;
  } catch (err) {
    return NextResponse.json(jsonRpcError(null, -32700, 'Parse error'), { status: 400 });
  }

  if (!payload || payload.jsonrpc !== '2.0' || typeof payload.method !== 'string') {
    return NextResponse.json(jsonRpcError(payload?.id, -32600, 'Invalid Request'), { status: 400 });
  }

  const gatewayUrl = resolveGatewayUrl();

  try {
    const upstream = await fetch(gatewayUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify(payload),
      cache: 'no-store'
    });
    const responseBody = await upstream.text();
    return new Response(responseBody, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'application/json; charset=utf-8',
        'cache-control': 'no-store'
      }
    });
  } catch {
    return NextResponse.json(jsonRpcError(payload.id, -32004, 'Gateway unreachable'), { status: 502 });
  }
}
