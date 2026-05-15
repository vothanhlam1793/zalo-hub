import { createCipheriv, createDecipheriv } from 'node:crypto';

type CookieJarLike = {
  getCookieString: (origin: string) => Promise<string> | string;
  setCookie?: (cookie: unknown, origin: string) => Promise<unknown> | unknown;
};

type ZaloContextLike = {
  API_TYPE: number;
  API_VERSION: number;
  cookie?: CookieJarLike;
  imei?: string;
  options?: {
    agent?: unknown;
    polyfill?: typeof fetch;
  };
  secretKey?: string | null;
  userAgent?: string;
};

type ZaloApiLike = {
  zpwServiceMap?: Record<string, string[]>;
  getContext?: () => ZaloContextLike;
};

type ZaloResponseEnvelope = {
  error_code?: number;
  error_message?: string;
  data?: string;
};

const ZERO_IV = Buffer.alloc(16, 0);

function getSessionContext(api: ZaloApiLike) {
  const ctx = api.getContext?.();
  if (!ctx?.secretKey) {
    throw new Error('Zalo session context khong hop le');
  }

  if (!ctx.imei) {
    throw new Error('Zalo session context thieu imei');
  }

  if (!ctx.userAgent) {
    throw new Error('Zalo session context thieu userAgent');
  }

  if (!ctx.cookie) {
    throw new Error('Zalo session context thieu cookie jar');
  }

  if (!ctx.options?.polyfill) {
    throw new Error('Zalo session context thieu fetch polyfill');
  }

  return ctx as ZaloContextLike & {
    cookie: CookieJarLike;
    imei: string;
    secretKey: string;
    userAgent: string;
    options: { agent?: unknown; polyfill: typeof fetch };
  };
}

function getServiceUrl(api: ZaloApiLike, service: string, endpoint: string) {
  const baseUrl = api.zpwServiceMap?.[service]?.[0];
  if (!baseUrl) {
    throw new Error(`Khong tim thay zpwServiceMap cho ${service}`);
  }

  return `${baseUrl}${endpoint}`;
}

function makeUrl(ctx: ZaloContextLike, baseUrl: string, params: Record<string, string> = {}) {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set('zpw_ver', String(ctx.API_VERSION));
  url.searchParams.set('zpw_type', String(ctx.API_TYPE));
  return url.toString();
}

function encodeAes(secretKey: string, data: string) {
  const key = Buffer.from(secretKey, 'base64');
  const cipher = createCipheriv('aes-128-cbc', key, ZERO_IV);
  return Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]).toString('base64');
}

function decodeAes(secretKey: string, data: string) {
  const key = Buffer.from(secretKey, 'base64');
  const decipher = createDecipheriv('aes-128-cbc', key, ZERO_IV);
  const normalized = decodeURIComponent(data);
  return Buffer.concat([
    decipher.update(Buffer.from(normalized, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

async function buildHeaders(ctx: ReturnType<typeof getSessionContext>, origin: string) {
  return {
    Accept: 'application/json, text/plain, */*',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Accept-Language': 'en-US,en;q=0.9',
    'content-type': 'application/x-www-form-urlencoded',
    Cookie: await ctx.cookie.getCookieString(origin),
    Origin: 'https://chat.zalo.me',
    Referer: 'https://chat.zalo.me/',
    'User-Agent': ctx.userAgent,
  };
}

async function request(ctx: ReturnType<typeof getSessionContext>, url: string, options: RequestInit = {}) {
  const origin = new URL(url).origin;
  const headers = await buildHeaders(ctx, origin);
  const fetchImpl = ctx.options.polyfill;
  const response = await fetchImpl(url, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers ?? {}),
    },
    ...(ctx.options.agent ? { agent: ctx.options.agent as never } : {}),
  } as RequestInit);

  const setCookie = response.headers.get('set-cookie');
  if (setCookie && ctx.cookie.setCookie) {
    for (const cookie of setCookie.split(', ')) {
      try {
        await ctx.cookie.setCookie(cookie, origin);
      } catch {
        // Group fetch should not fail just because a response cookie is malformed.
      }
    }
  }

  return response;
}

async function resolveResponse<T>(ctx: ReturnType<typeof getSessionContext>, response: Response, isEncrypted = true) {
  if (!response.ok) {
    throw new Error(`Request failed with status code ${response.status}`);
  }

  const payload = await response.json() as ZaloResponseEnvelope;
  if (payload.error_code && payload.error_code !== 0) {
    throw new Error(payload.error_message || `Zalo error ${payload.error_code}`);
  }

  if (!isEncrypted) {
    return payload as T;
  }

  if (typeof payload.data !== 'string') {
    throw new Error('Zalo response khong co encrypted payload hop le');
  }

  const decoded = JSON.parse(decodeAes(ctx.secretKey, payload.data)) as ZaloResponseEnvelope;
  if (decoded.error_code && decoded.error_code !== 0) {
    throw new Error(decoded.error_message || `Zalo error ${decoded.error_code}`);
  }

  return decoded.data as T;
}

export async function getAllGroups(api: ZaloApiLike) {
  const ctx = getSessionContext(api);
  const url = makeUrl(ctx, getServiceUrl(api, 'group_poll', '/api/group/getlg/v4'), {
    params: encodeAes(ctx.secretKey, JSON.stringify({ imei: ctx.imei })),
  });
  const response = await request(ctx, url, { method: 'GET' });
  return resolveResponse<Record<string, unknown>>(ctx, response, true);
}

export async function getGroupInfo(api: ZaloApiLike, groupIds: string[]) {
  const ctx = getSessionContext(api);
  const normalizedGroupIds = Array.from(new Set(groupIds.map((groupId) => String(groupId)).filter(Boolean)));
  const url = makeUrl(ctx, getServiceUrl(api, 'group', '/api/group/getmg-v2'));
  const encryptedParams = encodeAes(ctx.secretKey, JSON.stringify({
    gridVerMap: JSON.stringify(
      normalizedGroupIds.reduce<Record<string, number>>((accumulator, groupId) => {
        accumulator[groupId] = 0;
        return accumulator;
      }, {}),
    ),
  }));
  const response = await request(ctx, url, {
    method: 'POST',
    body: new URLSearchParams({ params: encryptedParams }),
  });
  return resolveResponse<Record<string, unknown>>(ctx, response, true);
}
