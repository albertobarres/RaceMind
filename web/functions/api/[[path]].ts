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

export async function onRequest(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const apiOrigin = env.RENDER_API_URL?.replace(/\/$/, '');
  if (!apiOrigin) return Response.json({ message: 'La API de RaceMind no está configurada.' }, { status: 503 });

  const incomingUrl = new URL(request.url);
  const upstreamUrl = `${apiOrigin}${incomingUrl.pathname}${incomingUrl.search}`;
  const headers = new Headers(request.headers);
  for (const header of hopByHopHeaders) headers.delete(header);

  const upstreamResponse = await fetch(upstreamUrl, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    redirect: 'manual',
  });

  const responseHeaders = new Headers();
  upstreamResponse.headers.forEach((value, name) => {
    if (name.toLowerCase() !== 'set-cookie' && !hopByHopHeaders.has(name.toLowerCase()))
      responseHeaders.append(name, value);
  });
  const upstreamHeaders = upstreamResponse.headers as Headers & { getSetCookie?: () => string[] };
  const cookies = upstreamHeaders.getSetCookie?.() ?? (upstreamResponse.headers.get('set-cookie') ? [upstreamResponse.headers.get('set-cookie')!] : []);
  for (const cookie of cookies) responseHeaders.append('Set-Cookie', cookie);
  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}
