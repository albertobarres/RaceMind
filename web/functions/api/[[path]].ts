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

const transientStatuses = new Set([408, 429, 500, 502, 503, 504, 520, 522, 523, 524, 525, 526, 530]);
const healthWakeupTimeoutMs = 75_000;
const initialHealthRetryDelayMs = 3_000;
const maximumHealthRetryDelayMs = 10_000;

export async function onRequest(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const apiOrigin = env.RENDER_API_URL?.replace(/\/$/, '');
  if (!apiOrigin) return Response.json({ message: 'La API de RaceMind no está configurada.' }, { status: 503 });

  const incomingUrl = new URL(request.url);
  const upstreamUrl = `${apiOrigin}${incomingUrl.pathname}${incomingUrl.search}`;
  const headers = new Headers(request.headers);
  for (const header of hopByHopHeaders) headers.delete(header);

  const isHealthCheck = incomingUrl.pathname === '/api/health' && (request.method === 'GET' || request.method === 'HEAD');
  const deadline = Date.now() + healthWakeupTimeoutMs;
  let retryDelayMs = initialHealthRetryDelayMs;
  let retryCount = 0;
  let upstreamResponse: Response | null = null;
  let lastError: unknown = null;

  do {
    try {
      upstreamResponse = await fetch(upstreamUrl, {
        method: request.method,
        headers,
        body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
        redirect: 'manual',
      });
      lastError = null;
      if (isHealthCheck) {
        console.log(JSON.stringify({
          event: 'racemind_health_upstream_response',
          status: upstreamResponse.status,
          retryCount,
        }));
      }
      if (!isHealthCheck || !transientStatuses.has(upstreamResponse.status)) break;
      if (Date.now() >= deadline) break;

      const retryAfter = upstreamResponse.headers.get('Retry-After');
      await upstreamResponse.body?.cancel();
      const retryAfterSeconds = Number(retryAfter);
      const delay = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? Math.min(retryAfterSeconds * 1_000, maximumHealthRetryDelayMs)
        : retryDelayMs;
      await new Promise((resolve) => setTimeout(resolve, Math.min(delay, Math.max(0, deadline - Date.now()))));
      retryDelayMs = Math.min(Math.round(retryDelayMs * 1.5), maximumHealthRetryDelayMs);
      retryCount++;
      continue;
    } catch (error) {
      lastError = error;
      if (isHealthCheck) {
        console.warn(JSON.stringify({
          event: 'racemind_health_upstream_error',
          retryCount,
          message: error instanceof Error ? error.message : 'Unknown upstream error',
        }));
      }
      if (!isHealthCheck || Date.now() >= deadline) break;
      await new Promise((resolve) => setTimeout(resolve, Math.min(retryDelayMs, Math.max(0, deadline - Date.now()))));
      retryDelayMs = Math.min(Math.round(retryDelayMs * 1.5), maximumHealthRetryDelayMs);
      retryCount++;
    }
  } while (isHealthCheck && Date.now() < deadline);

  if (!upstreamResponse) {
    console.error(JSON.stringify({
      event: 'racemind_health_upstream_unavailable',
      retryCount,
      message: lastError instanceof Error ? lastError.message : 'No upstream response',
    }));
    return Response.json({ message: lastError instanceof Error ? lastError.message : 'La API de Render sigue despertando o no responde.' }, {
      status: 503,
      headers: {
        'X-RaceMind-Proxy': 'cloudflare-pages',
        'X-RaceMind-Health-Retries': String(retryCount),
      },
    });
  }

  const responseHeaders = new Headers();
  upstreamResponse.headers.forEach((value, name) => {
    if (name.toLowerCase() !== 'set-cookie' && !hopByHopHeaders.has(name.toLowerCase()))
      responseHeaders.append(name, value);
  });
  responseHeaders.set('X-RaceMind-Proxy', 'cloudflare-pages');
  if (isHealthCheck) {
    responseHeaders.set('X-RaceMind-Upstream-Status', String(upstreamResponse.status));
    responseHeaders.set('X-RaceMind-Health-Retries', String(retryCount));
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
