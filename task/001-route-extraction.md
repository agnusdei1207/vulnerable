# Refactoring Plan: Route Extraction from server.js

> **Created**: 2026-02-25
> **Target**: Extract routes from monolithic `server.js` into modular structure
> **Scope**: Phase 1 - Info/Static routes (smallest, most isolated)

---

## 1. As-Is Structure

### Current State
```
app/
└── server.js (2115 lines)
    ├── Imports (lines 1-21)
    ├── App setup (lines 22-34)
    ├── 80+ routes (lines 39-2097)
    │   ├── Info routes (lines 39-179)
    │   ├── Auth routes (lines 204-337)
    │   ├── Product routes (lines 347-584)
    │   ├── Order routes (lines 606-658)
    │   ├── Admin routes (lines 728-811)
    │   ├── Injection routes (lines 970-1096)
    │   ├── SSRF routes (lines 1261-1309)
    │   ├── XSS routes (lines 1450-1531)
    │   ├── RCE routes (lines 1777-1919)
    │   └── ... (many more)
    └── Error handler (lines 2097-2115)
```

### Problems
1. **Single file, 2115 lines** - Hard to navigate, maintain, test
2. **Mixed concerns** - Auth, products, admin, vulnerabilities all mixed
3. **No separation** - Business logic, routes, DB queries inline
4. **Testing impossible** - Cannot unit test individual routes
5. **Code duplication** - Similar patterns repeated across routes

---

## 2. To-Be Structure

### Target Architecture
```
app/
├── server.js                    # Main entry (minimal)
│   ├── Imports
│   ├── App setup
│   ├── Route mounting
│   └── Server start
├── routes/
│   ├── index.js                 # Route aggregator
│   ├── info.js                  # Info/static routes
│   ├── auth.js                  # Auth routes
│   ├── products.js              # Product routes
│   ├── orders.js                # Order routes
│   ├── admin.js                 # Admin routes
│   ├── injection.js             # SQL/LDAP/XPath injection routes
│   ├── ssrf.js                  # SSRF routes
│   ├── xss.js                   # XSS routes
│   ├── rce.js                   # RCE/Command injection routes
│   └── ... (by domain)
├── middleware/
│   └── (future extraction)
├── db/
│   └── (future extraction)
└── views/                       # (unchanged)
```

---

## 3. Phase 1 Target: Info/Static Routes

### Why This First?
1. **Smallest scope** - 8 routes, ~140 lines
2. **Zero dependencies** - No auth, no DB, no external calls
3. **Easy to verify** - Static responses, predictable behavior
4. **Low risk** - Isolated, no side effects

### Routes to Extract
| Line | Route | Purpose |
|------|-------|---------|
| 39 | `GET /` | Home page (has DB query - defer) |
| 73 | `GET /dev-notes` | Developer notes |
| 78 | `GET /api-docs` | API documentation |
| 114 | `GET /robots.txt` | Robots file |
| 135 | `GET /sitemap.xml` | Sitemap |
| 151 | `GET /.well-known/security.txt` | Security info |
| 164 | `GET /backup` | Backup directory listing |
| 179 | `GET /.git/config` | Git config simulation |

### Excluded from Phase 1
- `GET /` - Has DB query, needs db layer first
- All routes with DB/external dependencies

---

## 4. Execution Steps

### Step 4-1: Create Route Infrastructure
```
Action: Create routes/ directory and index.js
Files:
  - app/routes/index.js (new)
Verify: No errors, imports work
```

### Step 4-2: Create info.js Route Module
```
Action: Create app/routes/info.js
Content:
  - Import express.Router
  - Copy 7 routes from server.js (lines 73-179)
  - Export router
Verify: File created, syntax valid
```

### Step 4-3: Mount info.js in server.js
```
Action: Modify server.js
Changes:
  - Add: const infoRoutes = require('./routes/info')
  - Add: app.use('/', infoRoutes)
  - Keep original routes for now (parallel running)
Verify: Server starts, both old and new routes work
```

### Step 4-4: Test New Routes
```
Action: Test each route
Tests:
  - GET /dev-notes → 200, correct content
  - GET /api-docs → 200, correct content
  - GET /robots.txt → 200, text/plain
  - GET /sitemap.xml → 200, application/xml
  - GET /.well-known/security.txt → 200, correct content
  - GET /backup → 200, correct content
  - GET /.git/config → 200, correct content
Verify: All routes return same response as before
```

### Step 4-5: Delete Old Routes
```
Action: Remove original routes from server.js
Delete: Lines 73-179 (7 routes)
Verify: Server starts, only new routes work
```

### Step 4-6: Final Verification
```
Action: Full test pass
Tests:
  - All 7 routes work
  - No 404s
  - Response bodies identical to before
  - No console errors
Verify: 100% behavioral equivalence
```

---

## 5. Rollback Plan

### If Step 4-3 Fails
```
1. Remove require() and app.use() from server.js
2. Delete routes/info.js
3. Server reverts to original state
```

### If Step 4-5 Fails
```
1. Restore deleted lines from git
2. Remove app.use() mount
3. Delete routes/info.js
4. Full revert to original
```

### Git Safety
```
# Before starting
git checkout -b refactor/route-extraction-phase1

# After each step
git add -A && git commit -m "refactor: step X - description"

# If rollback needed
git checkout main
git branch -D refactor/route-extraction-phase1
```

---

## 6. Impact Analysis

### Files Changed
| File | Change |
|------|--------|
| `app/server.js` | Remove 7 routes (~107 lines), add 2 lines |
| `app/routes/index.js` | NEW - Route aggregator |
| `app/routes/info.js` | NEW - 7 info routes |

### Dependencies
- **No new dependencies**
- Express.Router (built-in)

### Consumers
- **None** - These are leaf routes, not consumed by other code

### Breaking Changes
- **None** - Same URLs, same responses

---

## 7. Verification Checklist

### Pre-Deletion
- [ ] New routes file created
- [ ] Routes mounted in server.js
- [ ] All 7 routes tested and working
- [ ] Response bodies match original

### Post-Deletion
- [ ] Old routes removed from server.js
- [ ] No orphan code remaining
- [ ] Server starts without errors
- [ ] All routes still work
- [ ] No console warnings

### Final
- [ ] `git diff` shows only intended changes
- [ ] No accidental modifications
- [ ] Documentation updated (if any)

---

## 8. Future Phases (Out of Scope)

### Phase 2: Auth Routes
- Routes: /login, /register, /account, /profile, /logout
- Requires: DB layer extraction first

### Phase 3: Product Routes
- Routes: /products, /category, /new-arrivals, /sale
- Requires: DB layer extraction first

### Phase 4: Vulnerability Routes
- Group by attack type: injection, ssrf, xss, rce
- Each group to own file

### Phase 5: Middleware Extraction
- Auth middleware
- Error handling middleware

### Phase 6: Database Layer
- Repository pattern
- Query builders
- Connection management

---

## 9. Notes

- **DO NOT** change route behavior during extraction
- **DO NOT** fix vulnerabilities - they are intentional
- **DO NOT** add new features
- **ONLY** move code to new files
