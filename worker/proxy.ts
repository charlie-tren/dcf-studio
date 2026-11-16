/* Pass-through to Yahoo and the RBA for the browser. The Worker holds Yahoo's cookie and
   crumb, swaps them into each request and caches the reply at the edge; all parsing runs
   in the reader's browser, which keeps this inside the free plan's 10ms CPU. */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

const YAHOO_HOSTS = new Set(['query1.finance.yahoo.com', 'query2.finance.yahoo.com']);

/** Seconds to cache each Yahoo endpoint, matching what the Vercel build cached. */
const YAHOO_TTL: [RegExp, number][] = [
  [/^\/v10\/finance\/quoteSummary\//, 3600],
  [/^\/ws\/fundamentals-timeseries\/v1\/finance\/timeseries\//, 3600],
  [/^\/v1\/finance\/search$/, 3600],
  [/^\/v7\/finance\/quote$/, 300],
];

export const RBA_F2_URL = 'https://www.rba.gov.au/statistics/tables/csv/f2-data.csv';
const RBA_TTL = 86400;

type Session = { cookie: string; crumb: string; at: number };
let session: Session | null = null;
const SESSION_TTL_MS = 3600_000;
const SESSION_KEY = 'https://yf-session.internal/v1';

function edgeCache(): Cache | null {
  return typeof caches !== 'undefined' && 'default' in caches ? (caches as unknown as { default: Cache }).default : null;
}

function cookiesFrom(res: Response): string[] {
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  return (h.getSetCookie ? h.getSetCookie() : []).map((c) => c.split(';')[0]);
}

async function newSession(): Promise<Session> {
  const jar: string[] = [];
  for (const url of ['https://finance.yahoo.com/quote/AAPL', 'https://fc.yahoo.com/']) {
    const res = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': UA } });
    jar.push(...cookiesFrom(res));
    await res.body?.cancel();
    if (jar.length) break;
  }
  const cookie = jar.join('; ');
  const res = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': UA, cookie, referer: 'https://finance.yahoo.com/quote/AAPL' },
  });
  const crumb = (await res.text()).trim();
  if (!res.ok || !crumb || crumb.includes('<')) throw new Error(`Yahoo crumb refused (${res.status})`);
  return { cookie, crumb, at: Date.now() };
}

async function getSession(force: boolean): Promise<Session> {
  if (!force && session && Date.now() - session.at < SESSION_TTL_MS) return session;
  const cache = edgeCache();
  if (!force && cache) {
    const hit = await cache.match(SESSION_KEY);
    if (hit) {
      session = (await hit.json()) as Session;
      if (Date.now() - session.at < SESSION_TTL_MS) return session;
    }
  }
  session = await newSession();
  if (cache) {
    await cache.put(
      SESSION_KEY,
      new Response(JSON.stringify(session), { headers: { 'Cache-Control': `max-age=${SESSION_TTL_MS / 1000}` } })
    );
  }
  return session;
}

function reply(body: BodyInit | null, status: number, ttl: number, type: string | null): Response {
  const headers = new Headers({ 'Cache-Control': ttl > 0 && status === 200 ? `public, max-age=${ttl}` : 'no-store' });
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Content-Security-Policy', "default-src 'none'; sandbox");
  if (type) headers.set('Content-Type', type);
  return new Response(body, { status, headers });
}

async function cached(key: string, ttl: number, load: () => Promise<Response>, wait: (p: Promise<unknown>) => void) {
  const cache = edgeCache();
  if (cache) {
    const hit = await cache.match(key);
    if (hit) return hit;
  }
  const res = await load();
  if (cache && res.status === 200 && ttl > 0) wait(cache.put(key, res.clone()));
  return res;
}

async function yahoo(target: URL, wait: (p: Promise<unknown>) => void): Promise<Response> {
  const ttl = YAHOO_TTL.find(([re]) => re.test(target.pathname))?.[1];
  if (!YAHOO_HOSTS.has(target.hostname) || ttl === undefined) return reply('Not allowed', 403, 0, 'text/plain');
  target.searchParams.delete('crumb');
  target.searchParams.sort();
  const key = `https://yf-cache.internal${target.pathname}?${target.searchParams}`;

  return cached(key, ttl, async () => {
    for (const force of [false, true]) {
      const s = await getSession(force);
      const url = new URL(target);
      url.searchParams.set('crumb', s.crumb);
      const res = await fetch(url, { headers: { 'User-Agent': UA, cookie: s.cookie } });
      if ((res.status === 401 || res.status === 403) && !force) {
        await res.body?.cancel();
        continue;
      }
      return reply(res.body, res.status, ttl, 'application/json; charset=utf-8');
    }
    return reply('Yahoo refused the request', 502, 0, 'text/plain');
  }, wait);
}

async function rba(wait: (p: Promise<unknown>) => void): Promise<Response> {
  return cached('https://rba-cache.internal/f2', RBA_TTL, async () => {
    const res = await fetch(RBA_F2_URL, { headers: { 'User-Agent': UA } });
    return reply(res.body, res.status, RBA_TTL, 'text/csv; charset=utf-8');
  }, wait);
}

/** `/api/yf?u=<yahoo url>` and `/api/rba-f2`. Null for any other path. */
export async function handleProxy(request: Request, wait: (p: Promise<unknown>) => void): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === '/api/rba-f2') return rba(wait);
  if (url.pathname !== '/api/yf') return null;
  const u = url.searchParams.get('u');
  let target: URL;
  try {
    target = new URL(u ?? '');
  } catch {
    return reply('Bad url', 400, 0, 'text/plain');
  }
  try {
    return await yahoo(target, wait);
  } catch (error) {
    return reply(error instanceof Error ? error.message : 'Proxy error', 502, 0, 'text/plain');
  }
}
