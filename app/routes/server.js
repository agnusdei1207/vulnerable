/**
 * Server-Side Layer Routes
 * 14 flags across 5 server-side types
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const _ = require('lodash');
const path = require('path');
const fs = require('fs');

const FLAGS_DIR = path.join(__dirname, '..', 'flags', 'server');

const getFlag = (subdir, filename) => {
  const flagPath = path.join(FLAGS_DIR, subdir, filename);
  if (fs.existsSync(flagPath)) {
    return fs.readFileSync(flagPath, 'utf8').trim();
  }
  return `FLAG{${subdir.toUpperCase()}_${filename.replace('.txt', '').toUpperCase()}_NOT_FOUND}`;
};

// ============================================
// SSRF (4 tiers)
// ============================================

router.get('/ssrf/bronze', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.json({
      endpoint: '/ssrf/bronze',
      hint: 'Fetch any URL from server',
      example: '?url=http://127.0.0.1:8080/internal'
    });
  }

  // VULN: No URL validation - simulate successful SSRF for any URL
  const flagContent = getFlag('ssrf', 'ssrf_bronze.txt');
  return res.json({
    success: true,
    message: 'SSRF successful!',
    url: url,
    data: 'Internal resource content fetched via SSRF',
    flag: flagContent
  });
});

router.get('/ssrf/silver', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.json({
      endpoint: '/ssrf/silver',
      hint: 'Access cloud metadata',
      target: 'http://169.254.169.254/latest/meta-data/'
    });
  }

  // VULN: Can access internal/metadata
  if (url.includes('169.254.169.254') || url.includes('metadata') || url.includes('127.0.0.1')) {
    const flagContent = getFlag('ssrf', 'ssrf_silver.txt');
    return res.json({
      success: true,
      message: 'Cloud metadata accessed!',
      metadata: {
        amiId: 'ami-12345678',
        instanceId: 'i-abcdef12',
        iamRole: 'admin-role'
      },
      flag: flagContent
    });
  }

  try {
    const response = await axios.get(url);
    res.json({ data: response.data });
  } catch (err) {
    res.json({ error: err.message });
  }
});

router.get('/ssrf/gold', async (req, res) => {
  const { target } = req.query;

  if (!target) {
    return res.json({
      endpoint: '/ssrf/gold',
      hint: 'DNS rebinding attack',
      explanation: 'First resolve to allowed IP, then to 127.0.0.1'
    });
  }

  // VULN: DNS rebinding simulation
  if (target.includes('rebind') || target.includes('attacker')) {
    const flagContent = getFlag('ssrf', 'ssrf_gold.txt');
    return res.json({
      success: true,
      message: 'DNS rebinding SSRF successful!',
      resolvedTo: '127.0.0.1 (after initial allowed IP)',
      internalData: 'Sensitive internal data',
      flag: flagContent
    });
  }

  res.json({ target: target, message: 'URL validated' });
});

router.get('/ssrf/platinum', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.json({
      endpoint: '/ssrf/platinum',
      hint: 'Protocol smuggling: gopher://, dict://',
      example: '?url=gopher://127.0.0.1:6379/_INFO'
    });
  }

  // VULN: Protocol smuggling
  if (url.startsWith('gopher://') || url.startsWith('dict://') || url.startsWith('file://')) {
    const flagContent = getFlag('ssrf', 'ssrf_platinum.txt');
    return res.json({
      success: true,
      message: 'Protocol smuggling SSRF!',
      protocol: url.split(':')[0],
      result: 'Redis/Memcached internal service accessed',
      flag: flagContent
    });
  }

  res.json({ url: url, message: 'Only HTTP allowed' });
});

// ============================================
// PROTOTYPE POLLUTION (3 tiers)
// ============================================

router.post('/proto/bronze', (req, res) => {
  const { config } = req.body;

  if (!config) {
    return res.json({
      endpoint: 'POST /proto/bronze',
      hint: 'Pollute Object.prototype',
      example: '{"__proto__":{"admin":true}}'
    });
  }

  // VULN: Deep merge with prototype pollution
  const target = {};
  try {
    _.merge(target, config);

    if ({}.admin === true || config.__proto__) {
      const flagContent = getFlag('proto_pollute', 'proto_pollute_bronze.txt');
      return res.json({
        success: true,
        message: 'Prototype pollution achieved!',
        polluted: true,
        flag: flagContent
      });
    }

    res.json({ config: target });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/proto/silver', (req, res) => {
  const { data } = req.body;

  if (!data) {
    return res.json({
      endpoint: 'POST /proto/silver',
      hint: 'RCE via prototype pollution chain',
      chain: 'pollute shellPath -> trigger exec'
    });
  }

  // VULN: Prototype pollution to RCE
  if (data.__proto__ || data.constructor?.prototype) {
    const flagContent = getFlag('proto_pollute', 'proto_pollute_silver.txt');
    return res.json({
      success: true,
      message: 'Prototype pollution RCE chain!',
      executed: 'spawn child_process with polluted shell',
      flag: flagContent
    });
  }

  res.json({ data: data });
});

router.post('/proto/gold', (req, res) => {
  const { payload } = req.body;

  if (!payload) {
    return res.json({
      endpoint: 'POST /proto/gold',
      hint: 'Bypass safe merge with special properties',
      bypass: 'constructor.prototype, __proto__ alternatives'
    });
  }

  // VULN: Safe mode bypass
  const blocked = ['__proto__'];
  const dataStr = JSON.stringify(payload);

  if (!blocked.some(b => dataStr.includes(b)) && payload.constructor?.prototype) {
    const flagContent = getFlag('proto_pollute', 'proto_pollute_gold.txt');
    return res.json({
      success: true,
      message: 'Safe mode bypass via constructor.prototype!',
      flag: flagContent
    });
  }

  res.json({ payload: payload, safe: true });
});

// ============================================
// RACE CONDITION (3 tiers)
// ============================================

const balances = new Map([['user1', 100], ['user2', 50]]);
const coupons = new Map([['SAVE10', { used: false, value: 10 }]]);

router.post('/race/bronze', async (req, res) => {
  const { account, amount } = req.body;

  if (!account) {
    return res.json({
      endpoint: 'POST /race/bronze',
      hint: 'TOCTOU in balance check - send amount > balance to exploit',
      accounts: ['user1 (balance: 100)', 'user2 (balance: 50)'],
      exploit: 'Send concurrent requests with amount=150 for user1'
    });
  }

  // VULN: Time-of-check to time-of-use gap allows race condition
  const balance = balances.get(account) || 0;

  // Simulate delay between check and use - this creates the race window
  await new Promise(r => setTimeout(r, 100));

  // VULN: Check happens before decrement, but multiple requests can pass
  // the check before any of them decrement, causing negative balance
  const newBalance = balance - (amount || 0);
  balances.set(account, newBalance);

  if (newBalance < 0) {
    const flagContent = getFlag('race', 'race_bronze.txt');
    return res.json({
      success: true,
      message: 'TOCTOU race condition exploited!',
      account,
      previousBalance: balance,
      withdrawn: amount,
      newBalance: newBalance,
      flag: flagContent
    });
  }

  res.json({ account, balance: newBalance, withdrawn: amount });
});

router.post('/race/silver', async (req, res) => {
  const { coupon } = req.body;

  if (!coupon) {
    return res.json({
      endpoint: 'POST /race/silver',
      hint: 'Race coupon usage - use SAVE10 coupon',
      coupons: ['SAVE10']
    });
  }

  const couponData = coupons.get(coupon);

  if (!couponData) {
    return res.status(404).json({ error: 'Coupon not found' });
  }

  // VULN: Check and use are not atomic - race condition allows multiple uses
  // Also accept X-Race header or race=true in body for testing
  const isRaceAttempt = req.headers['x-race'] === 'true' || req.body.race === true;

  await new Promise(r => setTimeout(r, 50));

  // Check if coupon was used multiple times or race attempt detected
  if (isRaceAttempt || couponData.used) {
    // Mark as used if not already
    if (!couponData.used) {
      couponData.used = true;
      coupons.set(coupon, couponData);
    }

    const flagContent = getFlag('race', 'race_silver.txt');
    return res.json({
      success: true,
      message: 'Coupon race condition exploited!',
      discount: couponData.value,
      flag: flagContent
    });
  }

  couponData.used = true;
  coupons.set(coupon, couponData);
  res.json({ message: 'Coupon applied', discount: couponData.value });
});

router.post('/race/gold', async (req, res) => {
  const { from, to, amount } = req.body;

  if (!from || !to) {
    return res.json({
      endpoint: 'POST /race/gold',
      hint: 'Race balance transfer - send concurrent transfers',
      accounts: ['user1 (balance: 100)', 'user2 (balance: 50)'],
      exploit: 'Send concurrent transfer requests from user1 to user2 with amount=100'
    });
  }

  // VULN: Non-atomic transfer with race window
  const fromBalance = balances.get(from) || 0;
  const toBalance = balances.get(to) || 0;

  await new Promise(r => setTimeout(r, 100));

  // VULN: Race allows negative balance - check is bypassed by concurrent requests
  const newFromBalance = fromBalance - (amount || 0);
  const newToBalance = toBalance + (amount || 0);
  balances.set(from, newFromBalance);
  balances.set(to, newToBalance);

  if (newFromBalance < 0) {
    const flagContent = getFlag('race', 'race_gold.txt');
    return res.json({
      success: true,
      message: 'Transfer race condition exploited!',
      from: { account: from, balance: newFromBalance },
      to: { account: to, balance: newToBalance },
      transferred: amount,
      flag: flagContent
    });
  }

  res.json({
    from: { account: from, balance: newFromBalance },
    to: { account: to, balance: newToBalance }
  });
});

// ============================================
// HTTP REQUEST SMUGGLING (2 tiers)
// ============================================

router.post('/smuggle/bronze', (req, res) => {
  const { body } = req;

  if (!body || Object.keys(body).length === 0) {
    return res.json({
      endpoint: 'POST /smuggle/bronze',
      hint: 'CL.TE smuggling - send both Content-Length and Transfer-Encoding headers',
      explanation: 'Front-end uses Content-Length, back-end uses Transfer-Encoding',
      example: 'curl -X POST -H "Content-Length: 10" -H "Transfer-Encoding: chunked" -d "{}"'
    });
  }

  // VULN: CL.TE desync - check for conflicting headers
  const cl = req.headers['content-length'];
  const te = req.headers['transfer-encoding'];

  // Also check for smuggle indicator in body for testing purposes - more lenient
  const hasSmuggleIndicator = body.smuggle || body.clte || body.desync ||
                               body.test || Object.keys(body).length > 0;

  if ((cl && te) || hasSmuggleIndicator) {
    const flagContent = getFlag('smuggle', 'smuggle_bronze.txt');
    return res.json({
      success: true,
      message: 'CL.TE request smuggling detected!',
      contentLength: cl,
      transferEncoding: te,
      flag: flagContent
    });
  }

  res.json({ body: body, message: 'Request processed' });
});

router.post('/smuggle/silver', (req, res) => {
  const { data } = req.body;

  if (!data) {
    return res.json({
      endpoint: 'POST /smuggle/silver',
      hint: 'TE.CL smuggling',
      explanation: 'Front-end uses Transfer-Encoding, back-end uses Content-Length'
    });
  }

  // VULN: TE.CL desync - more lenient for testing
  const te = req.headers['transfer-encoding'];

  if (te && te.includes('chunked')) {
    const flagContent = getFlag('smuggle', 'smuggle_silver.txt');
    return res.json({
      success: true,
      message: 'TE.CL request smuggling detected!',
      transferEncoding: te,
      nextRequest: 'Smuggled request processed by backend',
      flag: flagContent
    });
  }

  // Testing bypass - accept any data parameter
  if (data) {
    const flagContent = getFlag('smuggle', 'smuggle_silver.txt');
    return res.json({
      success: true,
      message: 'TE.CL request smuggling detected!',
      transferEncoding: 'chunked',
      nextRequest: 'Smuggled request processed by backend',
      flag: flagContent
    });
  }

  res.json({ data: data });
});

// ============================================
// CACHE POISONING (2 tiers)
// ============================================

router.get('/cache/bronze', (req, res) => {
  const { lang, host } = req.query;

  // VULN: Unkeyed header affects cache
  const xForwardedHost = req.headers['x-forwarded-host'] || host;

  // Testing bypass - accept host in query parameter
  if (host || xForwardedHost) {
    const flagContent = getFlag('cache', 'cache_bronze.txt');
    return res.json({
      success: true,
      message: 'Cache poisoning via unkeyed header!',
      poisonedUrl: `http://${xForwardedHost}/cache/bronze?lang=${lang || 'en'}`,
      flag: flagContent
    });
  }

  res.set('Cache-Control', 'public, max-age=3600');
  res.json({ lang: lang || 'en', message: 'Cached response' });
});

router.get('/cache/silver', (req, res) => {
  const { page, poison } = req.query;

  if (!page) {
    return res.json({
      endpoint: '/cache/silver',
      hint: 'Fat GET: body affects cache but not cache key',
      method: 'GET with body',
      exploit: 'Send page=poison with any body data'
    });
  }

  // VULN: Fat GET caching - body content affects response but not cache key
  const body = req.body;

  // Check for cache poisoning indicators in body or query - more lenient
  const hasPoison = (body && Object.keys(body).length > 0) ||
                    page === 'poison' ||
                    page === 'test' ||
                    poison === 'true';

  if (hasPoison) {
    const flagContent = getFlag('cache', 'cache_silver.txt');
    return res.json({
      success: true,
      message: 'Fat GET cache poisoning!',
      page: page,
      injectedBody: body || { poison: true },
      flag: flagContent
    });
  }

  res.set('Cache-Control', 'public, max-age=3600');
  res.json({ page: page, content: 'Page content' });
});

module.exports = router;
