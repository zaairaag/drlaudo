import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { clearTimeout, setTimeout } from 'node:timers';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    'base-url': { type: 'string' },
    'check-proxy': { type: 'boolean', default: false },
    'login-limit': { type: 'string' },
  },
});

async function checkDelivery() {
  assert(values['base-url'], 'Use --base-url http://127.0.0.1:<QA-port>');
  const base = new URL(values['base-url']);
  assert.equal(base.protocol, 'http:', 'This probe is only for local disposable QA.');
  assert(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname), 'QA must be loopback.');
  assert(!base.username && !base.password && !base.search && !base.hash);
  assert.equal(base.pathname, '/', 'Use the origin, without /api or another path.');

  async function request(path, options = {}) {
    return fetch(new URL(path, base), {
      ...options,
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });
  }

  const expectedHeaders = {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'x-frame-options': 'DENY',
    'x-robots-tag': 'noindex, nofollow',
  };
  let expectedCsp;
  function checkHeaders(response, label) {
    for (const [header, expected] of Object.entries(expectedHeaders)) {
      assert.equal(response.headers.get(header), expected, `${label}: ${header}`);
    }
    const csp = response.headers.get('content-security-policy');
    assert(csp, `${label}: Content-Security-Policy is missing`);
    for (const directive of [
      "default-src 'self'",
      "script-src 'self'",
      "connect-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
    ]) {
      assert(csp.split(';').map((part) => part.trim()).includes(directive), `${label}: ${directive}`);
    }
    assert(!csp.includes('unsafe-eval'), `${label}: unsafe-eval is forbidden`);
    expectedCsp ??= csp;
    assert.equal(csp, expectedCsp, `${label}: security policy differs from HTML`);
  }

  const html = await request('/');
  assert.equal(html.status, 200, 'HTML must be available.');
  checkHeaders(html, 'HTML');
  assert.equal(html.headers.get('cache-control'), 'no-store');
  const markup = await html.text();
  const assetPath = /<script\b[^>]*\bsrc=["']([^"']+)["']/iu.exec(markup)?.[1];
  assert(assetPath, 'Production HTML must reference an emitted script.');
  const assetUrl = new URL(assetPath, base);
  assert.equal(assetUrl.origin, base.origin);
  assert(assetUrl.pathname.startsWith('/assets/'));
  const asset = await request(assetUrl.pathname);
  assert.equal(asset.status, 200, 'Emitted script must be available.');
  checkHeaders(asset, 'asset');
  assert.equal(asset.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  await asset.arrayBuffer();

  const missingAsset = await request('/assets/__delivery_missing__.js');
  assert.equal(missingAsset.status, 404);
  checkHeaders(missingAsset, 'missing asset');
  assert.equal(missingAsset.headers.get('cache-control'), 'no-store');
  await missingAsset.arrayBuffer();

  const health = await request('/api/health');
  assert.equal(health.status, 200, 'API/PostgreSQL must be healthy.');
  checkHeaders(health, 'API');
  assert.equal(health.headers.get('cache-control'), 'no-store');
  assert(health.headers.get('content-type')?.includes('application/json'));
  await health.json();

  for (const framing of ['content-length', 'chunked-open']) {
    const headers = { 'content-type': 'application/json' };
    if (framing === 'content-length') headers['content-length'] = '1';
    else headers['transfer-encoding'] = 'chunked';
    const client = httpRequest(new URL('/api/health', base), {
      method: 'GET', headers, agent: false,
    });
    let responseStream;
    let deadline;
    try {
      const response = await new Promise((resolve, reject) => {
        deadline = setTimeout(() => reject(new Error(`${framing}: NoBody response timed out.`)), 4_000);
        client.once('error', reject);
        client.once('response', (incoming) => {
          responseStream = incoming;
          incoming.setEncoding('utf8');
          let body = '';
          incoming.on('data', (chunk) => { body += chunk; });
          incoming.once('error', reject);
          incoming.once('aborted', () => reject(new Error(`${framing}: response was interrupted.`)));
          incoming.once('end', () => resolve({
            status: incoming.statusCode,
            contentType: incoming.headers['content-type'],
            body,
            uploadEnded: client.writableEnded,
          }));
        });
        // Do not terminate this upload: the response must arrive after its first byte.
        if (framing === 'chunked-open') client.write('{');
        else client.end('{');
      });
      assert.equal(response.status, 400, `${framing}: NoBody must return 400.`);
      assert(response.contentType?.includes('application/json'), `${framing}: expected JSON.`);
      const error = JSON.parse(response.body).error;
      assert.equal(error.code, 'VALIDATION_ERROR', `${framing}: expected validation error.`);
      assert(error.details.some((detail) => detail.location === 'body' && detail.rule === 'UNEXPECTED_BODY'),
        `${framing}: expected UNEXPECTED_BODY.`);
      if (framing === 'chunked-open') assert.equal(response.uploadEnded, false);
    } finally {
      clearTimeout(deadline);
      responseStream?.destroy();
      client.destroy();
    }
  }
  console.log('PASS: NoBody rejects finite and open streaming uploads through the proxy.');

  const missingApi = await request('/api/__delivery_missing__');
  assert(missingApi.status >= 400, 'Unknown API path must not be a successful SPA response.');
  checkHeaders(missingApi, 'missing API');
  assert.equal(missingApi.headers.get('cache-control'), 'no-store');
  assert(missingApi.headers.get('content-type')?.includes('application/json'));
  await missingApi.json();

  const redirect = await request('/api?delivery=1');
  assert.equal(redirect.status, 308);
  checkHeaders(redirect, 'API redirect');
  const location = redirect.headers.get('location');
  assert(location, 'API redirect must include Location.');
  const destination = new URL(location, base);
  assert.equal(destination.origin, base.origin, 'Redirect must preserve the external port.');
  assert.equal(destination.pathname, '/api/');
  assert.equal(destination.search, '?delivery=1');
  await redirect.arrayBuffer();
  console.log('PASS: HTML/assets/API/error headers, cache policy, JSON API fallback and redirect port.');

  if (!values['check-proxy']) return;
  const limit = Number(values['login-limit']);
  assert(Number.isSafeInteger(limit) && limit > 0, '--check-proxy requires the configured --login-limit.');
  // Use a fresh QA process/bucket: this intentionally consumes its login quota.
  // Reserved fictitious identity only; no demo or real account is changed.
  for (let attempt = 0; attempt <= limit; attempt += 1) {
    const forgedIp = `198.51.${Math.floor(attempt / 250) % 250}.${attempt % 250 + 1}`;
    const response = await request('/api/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': forgedIp,
        'x-real-ip': forgedIp,
        forwarded: `for=${forgedIp}`,
      },
      body: JSON.stringify({ email: 'proxy-probe@example.invalid', password: 'Incorrect@1234' }),
    });
    assert.equal(
      response.status,
      attempt < limit ? 401 : 429,
      'Forged forwarding headers must share one IP quota; run on fresh disposable QA.',
    );
    checkHeaders(response, 'login');
    await response.arrayBuffer();
  }
  console.log('PASS: changing client X-Forwarded-For/Forwarded cannot bypass the login IP quota.');
}

try {
  await checkDelivery();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Delivery probe failed.');
  process.exitCode = 1;
}
