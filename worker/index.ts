import { handleProxy } from './proxy';

type Env = { ASSETS: { fetch: (req: Request | string) => Promise<Response> } };

/* Runs only when no static file matches. A single path segment is a ticker the build
   did not prebuild, so it gets the company shell; anything else is a 404. */
const TICKER = /^\/[A-Za-z0-9^=._-]{1,20}$/;

const worker = {
  async fetch(request: Request, env: Env, ctx: { waitUntil: (p: Promise<unknown>) => void }) {
    const proxied = await handleProxy(request, (p) => ctx.waitUntil(p));
    if (proxied) return proxied;

    const url = new URL(request.url);
    if (request.method === 'GET' && TICKER.test(url.pathname)) {
      const upper = url.pathname.toUpperCase();
      if (upper !== url.pathname) {
        const built = await env.ASSETS.fetch(new URL(upper, url).toString());
        if (built.ok) return built;
      }
      const shell = await env.ASSETS.fetch(new URL('/company', url).toString());
      return new Response(shell.body, { status: 200, headers: shell.headers });
    }
    const notFound = await env.ASSETS.fetch(new URL('/404', url).toString());
    return new Response(notFound.body, { status: 404, headers: notFound.headers });
  },
};

export default worker;
