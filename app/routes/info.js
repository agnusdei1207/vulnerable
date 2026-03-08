/**
 * Info/Static Routes
 * These routes serve static information and documentation
 *
 * VULNERABILITIES: These routes intentionally expose sensitive information
 * - /dev-notes - Developer notes
 * - /api-docs - API documentation with vulnerability hints
 * - /robots.txt - Exposes hidden paths
 * - /sitemap.xml - Exposes internal URLs
 * - /.well-known/security.txt - Exposes credentials
 * - /backup - Exposes backup file listing
 * - /.git/config - Simulates git exposure
 */

const express = require('express');
const router = express.Router();

// Developer notes page
router.get('/dev-notes', (req, res) => {
  res.render('dev-notes');
});

// API documentation - VULN: Exposes all endpoints
router.get('/api-docs', (req, res) => {
  res.json({
    title: 'LUXORA API Documentation',
    version: '1.0.0',
    endpoints: {
      public: [
        { method: 'GET', path: '/', description: 'Home page' },
        { method: 'GET', path: '/products', description: 'List products' },
        { method: 'GET', path: '/products/:id', description: 'Get product' },
        { method: 'GET', path: '/search?q=', description: 'Search products' }
      ],
      auth: [
        { method: 'POST', path: '/login', description: 'User login', vuln: 'SQL Injection' },
        { method: 'POST', path: '/register', description: 'User registration' },
        { method: 'GET', path: '/account', description: 'User account' },
        { method: 'GET', path: '/profile/:id', description: 'User profile', vuln: 'IDOR' }
      ],
      admin: [
        { method: 'GET', path: '/admin', description: 'Admin dashboard', vuln: 'Cookie bypass' },
        { method: 'GET', path: '/admin/login', description: 'Admin login' }
      ],
      dangerous: [
        { method: 'GET', path: '/upload', description: 'File upload', vuln: 'RCE via web shell' },
        { method: 'GET', path: '/image?url=', description: 'Image proxy', vuln: 'SSRF' },
        { method: 'GET', path: '/download?file=', description: 'File download', vuln: 'Path traversal' },
        { method: 'GET', path: '/debug', description: 'Debug info', vuln: 'Info disclosure' },
        { method: 'GET', path: '/config', description: 'Config', vuln: 'Credential exposure' },
        { method: 'GET', path: '/cmd?exec=', description: 'Command exec', vuln: 'RCE' },
        { method: 'POST', path: '/webshell', description: 'Web shell', vuln: 'RCE' }
      ]
    },
    note: 'Some endpoints may have security issues. See /dev-notes for details.'
  });
});

// Robots.txt - VULN: Exposes hidden paths
router.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`# robots.txt for LUXORA
User-agent: *
Disallow: /admin/
Disallow: /api/v1/
Disallow: /debug/
Disallow: /config/
Disallow: /dev-notes/
Disallow: /api-docs
Disallow: /backup/
Disallow: /.git/
Disallow: /secrets/
Disallow: /flags/
Disallow: /.hidden/
Disallow: /uploads/
Disallow: /files?dir=
Disallow: /download?file=
`);
});

// Sitemap with hidden endpoints
router.get('/sitemap.xml', (req, res) => {
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://luxora.com/</loc></url>
  <url><loc>https://luxora.com/products</loc></url>
  <url><loc>https://luxora.com/new-arrivals</loc></url>
  <url><loc>https://luxora.com/sale</loc></url>
  <!-- TODO: Remove internal URLs before production! -->
  <url><loc>https://luxora.com/admin</loc></url>
  <url><loc>https://luxora.com/dev-notes</loc></url>
  <url><loc>https://luxora.com/api-docs</loc></url>
</urlset>
`);
});

// .well-known - common security research path
router.get('/.well-known/security.txt', (req, res) => {
  res.type('text/plain').send(`Contact: security@luxora.com
Expires: 2024-12-31T23:59:00.000Z
Preferred-Languages: en, ko

# Internal Security Notes
# Admin credentials: admin:admin123
# SSH keys at: /home/mike/.ssh/id_rsa
# Backups at: /var/backups/
`);
});

// Backup directory listing - VULN: Exposes backup files
router.get('/backup', (req, res) => {
  res.json({
    message: 'Backup Directory',
    files: [
      { name: 'db_backup_2024-01-15.sql.gz', size: '15MB', date: '2024-01-15' },
      { name: 'db_backup_2024-01-14.sql.gz', size: '14MB', date: '2024-01-14' },
      { name: 'ssh_keys_backup.tar.gz', size: '2KB', date: '2024-01-10' },
      { name: 'config_backup.tar.gz', size: '5KB', date: '2024-01-10' },
      { name: 'user_data_export.csv', size: '1.2MB', date: '2024-01-12' }
    ],
    hint: 'Download via /download?file=../backup/filename'
  });
});

// Git exposure simulation - VULN: .git directory exposed
router.get('/.git/config', (req, res) => {
  res.type('text/plain').send(`[core]
	repositoryformatversion = 0
	filemode = true
	bare = false
	logallrefupdates = true
[remote "origin"]
	url = git@github.com:luxora/internal-shop.git
	fetch = +refs/heads/*:refs/remotes/origin/*
[branch "main"]
	remote = origin
	merge = refs/heads/main
[user]
	name = Mike Johnson
	email = mike@luxora.com
[credential]
	helper = store
`);
});

module.exports = router;
