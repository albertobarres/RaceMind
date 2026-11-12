interface PagesEnvironment {
  RENDER_API_URL: string;
}

interface PagesContext {
  request: Request;
  env: PagesEnvironment;
}

const hopByHopHeaders = new Set([
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

const healthRequestTimeoutMs = 10_000;

export async function onRequest(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const apiOrigin = env.RENDER_API_URL?.replace(/\/$/, '');
  if (!apiOrigin) return Response.json({ message: 'La API de RaceMind no está configurada.' }, { status: 503 });

  const incomingUrl = new URL(request.url);
  const upstreamUrl = `${apiOrigin}${incomingUrl.pathname}${incomingUrl.search}`;
  const headers = new Headers(request.headers);
  for (const header of hopByHopHeaders) headers.delete(header);

  const isHealthCheck = incomingUrl.pathname === '/api/health' && (request.method === 'GET' || request.method === 'HEAD');
  const controller = isHealthCheck ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), healthRequestTimeoutMs) : null;
  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      redirect: 'manual',
      signal: controller?.signal,
    });
  } catch (error) {
    if (isHealthCheck) {
      console.warn(JSON.stringify({
        event: 'racemind_health_upstream_error',
        message: error instanceof Error ? error.message : 'Unknown upstream error',
      }));
      return Response.json({ message: 'La API de Render sigue despertando. Reintentando comprobación.' }, {
        status: 503,
        headers: {
          'Retry-After': '3',
          'X-RaceMind-Proxy': 'cloudflare-pages',
          'X-RaceMind-Upstream-Status': 'unavailable',
        },
      });
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }

  if (isHealthCheck) {
    console.log(JSON.stringify({
      event: 'racemind_health_upstream_response',
      status: upstreamResponse.status,
    }));
  }

  const responseHeaders = new Headers();
  upstreamResponse.headers.forEach((value, name) => {
    if (name.toLowerCase() !== 'set-cookie' && !hopByHopHeaders.has(name.toLowerCase()))
      responseHeaders.append(name, value);
  });
  responseHeaders.set('X-RaceMind-Proxy', 'cloudflare-pages');
  if (isHealthCheck) {
    responseHeaders.set('X-RaceMind-Upstream-Status', String(upstreamResponse.status));
  }
  const upstreamHeaders = upstreamResponse.headers as Headers & { getSetCookie?: () => string[] };
  const cookies = upstreamHeaders.getSetCookie?.() ?? (upstreamResponse.headers.get('set-cookie') ? [upstreamResponse.headers.get('set-cookie')!] : []);
  for (const cookie of cookies) responseHeaders.append('Set-Cookie', cookie);
  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}
