# Refactoring Plan: Admin Routes Extraction (Phase 2)

> **Created**: 2026-02-25
> **Target**: Extract admin routes from `server.js` into `routes/admin.js`
> **Scope**: 4 routes, ~82 lines, zero DB dependencies

---

## 1. As-Is Structure

### Current State (server.js lines 603-684)
```
app/server.js
├── Line 603-605:   GET /admin/login      (render)
├── Line 608-628:   POST /admin/login     (hardcoded auth)
├── Line 631-664:   GET /admin            (cookie-based auth)
└── Line 669-684:   GET /encrypt          (weak crypto)
```

### Dependencies
- `req.cookies` (cookie-parser middleware)
- `res.render()` (EJS templates: admin-login, admin-panel)
- `res.cookie()` (set-cookie)
- `res.redirect()`, `res.json()`
- **NO pool.query** — No database dependency

### Vulnerabilities Preserved
- A01:2021 — Broken Access Control (cookie bypass)
- A02:2021 — Cryptographic Failures (weak encryption)
- FLAG: `FLAG{ADMIN_AUTH_SUCCESS_COOKIE_BYPASS}`
- FLAG: `FLAG{CRYPTO_WEAK_ENCRYPTION_BYPASSED}`

---

## 2. To-Be Structure

### Target Architecture
```
app/
├── server.js                    # Main entry (reduced by ~82 lines)
└── routes/
    ├── index.js                 # Route aggregator (add admin routes)
    ├── info.js                  # Phase 1 (complete)
    └── admin.js                 # NEW - Admin routes
```

### routes/admin.js Structure
```javascript
/**
 * Admin Routes
 * A01:2021 - Broken Access Control
 * A02:2021 - Cryptographic Failures
 *
 * VULNERABILITIES:
 * - Cookie-based auth bypass
 * - Hardcoded weak credentials
 * - Weak encryption (base64)
 * - Timing attack possible
 * - No rate limiting
 */

const express = require('express');
const router = express.Router();

// GET /admin/login
// POST /admin/login
// GET /admin
// GET /encrypt

module.exports = router;
```

---

## 3. Execution Steps

### Step 4-1: Create routes/admin.js
```
Action: Create new file with 4 routes
Content:
  - Import express.Router
  - Copy routes from server.js lines 603-684
  - Export router
Verify: node --check routes/admin.js
```

### Step 4-2: Update routes/index.js
```
Action: Add admin routes to aggregator
Changes:
  - Add: const adminRoutes = require('./admin')
  - Add: router.use('/', adminRoutes)
Verify: node --check routes/index.js
```

### Step 4-3: Verify Module Loading
```
Action: Test that all routes are registered
Command: node -e "const r = require('./routes/admin'); console.log(r.stack.length)"
Expected: 4 routes
Verify: All 4 routes listed
```

### Step 4-4: Delete Old Routes from server.js
```
Action: Remove lines 603-684 from server.js
Delete:
  - Section header comment (A01:2021)
  - GET /admin/login
  - POST /admin/login
  - GET /admin
  - Section header comment (A02:2021)
  - GET /encrypt
  - (Keep POST /register - has DB dependency)
Verify: node --check server.js
```

### Step 4-5: Final Verification
```
Action: Full verification
Tests:
  - Syntax valid: node --check all files
  - Routes registered: 4 routes in admin.js
  - Line count: server.js reduced by ~82 lines
  - No dead references
Verify: All checks pass
```

---

## 4. Rollback Plan

### If Any Step Fails
```
1. git status — check changes
2. git checkout -- app/server.js app/routes/
3. Delete routes/admin.js if created
4. Full revert to last known good state
```

### Git Safety
```
# Current branch should be: refactor/route-extraction-phase1
# Create new branch for Phase 2
git checkout -b refactor/admin-routes-phase2

# After each step
git add -A && git commit -m "refactor(phase2): step X - description"
```

---

## 5. Impact Analysis

### Files Changed
| File | Action | Lines Changed |
|------|--------|---------------|
| `app/routes/admin.js` | NEW | +90 |
| `app/routes/index.js` | MODIFY | +2 |
| `app/server.js` | MODIFY | -82 |

### Dependencies
- **No new dependencies**
- Uses existing cookie-parser middleware
- Uses existing EJS templates

### Consumers
- **None** — These are leaf routes

### Breaking Changes
- **None** — Same URLs, same behavior

---

## 6. Verification Checklist

### Pre-Deletion
- [ ] [FULL SURVEY FLOW] routes/admin.js created
- [ ] [FULL SURVEY FLOW] routes/index.js updated
- [ ] [FULL SURVEY FLOW] All 4 routes verified in module

### Post-Deletion
- [ ] [FULL SURVEY FLOW] Old routes removed from server.js
- [ ] [FULL SURVEY FLOW] Syntax valid (node --check)
- [ ] [FULL SURVEY FLOW] Module loads correctly
- [ ] [FULL SURVEY FLOW] No dead references

### Final
- [ ] [FULL SURVEY FLOW] git diff shows only intended changes
- [ ] [FULL SURVEY FLOW] Line count: server.js reduced by ~82
- [ ] [FULL SURVEY FLOW] All routes still accessible

---

## 7. Routes Detail

### GET /admin/login (lines 603-605)
```javascript
app.get('/admin/login', (req, res) => {
  res.render('admin-login', { error: false });
});
```

### POST /admin/login (lines 608-628)
```javascript
app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  const adminUsers = {
    'admin': 'admin123',
    'root': 'toor',
    'administrator': 'administrator'
  };
  if (adminUsers[username] && adminUsers[username] === password) {
    res.cookie('auth', JSON.stringify({ username, role: 'admin' }), { httpOnly: false });
    res.cookie('isAdmin', 'true');
    return res.redirect('/admin');
  }
  res.render('admin-login', { error: true });
});
```

### GET /admin (lines 631-664)
```javascript
app.get('/admin', (req, res) => {
  const auth = req.cookies.auth;
  const isAdmin = req.cookies.isAdmin === 'true';
  if (auth || isAdmin) {
    // ... cookie bypass logic, FLAG, render admin-panel
  }
  res.redirect('/admin/login');
});
```

### GET /encrypt (lines 669-684)
```javascript
app.get('/encrypt', (req, res) => {
  const { data } = req.query;
  const encrypted = Buffer.from(data || '').toString('base64');
  const secretKey = 'my_super_secret_key_12345';
  res.json({ encrypted, secretKey, algorithm: 'base64', flag: 'FLAG{...}' });
});
```

---

## 8. Notes

- **DO NOT** fix vulnerabilities — cookie bypass is intentional
- **DO NOT** add rate limiting, CSRF protection, or secure cookies
- **ONLY** move code to improve structure
- Preserve all FLAG values exactly
