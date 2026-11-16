import YahooFinance from 'yahoo-finance2';
import { ExtendedCookieJar } from 'yahoo-finance2/lib/cookieJar';
import { yahooApi, type YahooInstance } from './yahoo';

/* yahoo-finance2 run in the browser. Every request goes to the site's own /api/yf, which
   adds Yahoo's cookie and crumb. The jar is seeded with placeholders so the library
   skips its own cookie handshake, which a browser cannot complete. */

type Fetch = typeof fetch;

export function proxiedFetch(base: string, send: Fetch = fetch): Fetch {
  return ((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return send(`${base}/api/yf?u=${encodeURIComponent(url)}`);
  }) as Fetch;
}

async function seededJar(): Promise<ExtendedCookieJar> {
  const jar = new ExtendedCookieJar();
  await jar.setCookie('crumb=proxy; Max-Age=31536000', 'http://config.yf2/');
  await jar.setCookie('A3=proxy; Domain=.yahoo.com; Path=/; Max-Age=31536000; Secure', 'https://finance.yahoo.com/');
  return jar;
}

export function browserYahoo(base = '', send: Fetch = fetch) {
  let instance: Promise<YahooInstance> | null = null;
  return yahooApi(
    () =>
      (instance ??= seededJar().then(
        (cookieJar) =>
          new YahooFinance({ suppressNotices: ['yahooSurvey'], cookieJar, fetch: proxiedFetch(base, send) })
      ))
  );
}
