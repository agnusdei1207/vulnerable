# Refactoring Plan: Page Routes Extraction (Phase 3)

> **Created**: 2026-02-25
> **Target**: Extract page routes from `server.js` into `routes/pages.js`
> **Scope**: 5 routes, ~25 lines, zero DB dependencies

---

## 1. As-Is Structure

### Current State (server.js lines 516-542)
```
app/server.js
├── Line 517-519:  GET /checkout           (render)
├── Line 521-527:  POST /checkout          (log + redirect)
├── Line 529-531:  GET /checkout/success   (render)
├── Line 534-536:  GET /about              (render)
└── Line 539-542:  GET /contact            (render + query param)
```

### Excluded (has DB dependency)
- Line 544-559: POST /contact (uses pool.query)

### Dependencies
- `res.render()` (EJS templates: checkout, checkout-success, about, contact)
- `res.redirect()`
- `console.log()` (vulnerability: logs sensitive data)
- `req.query.sent` (query parameter)
- **NO pool.query** — No database dependency

### Vulnerabilities Preserved
- Credit card data logged in plaintext (POST /checkout)
- User input logged without sanitization

---

## 2. To-Be Structure

### Target Architecture
```
app/
├── server.js                    # Main entry (reduced by ~25 lines)
└── routes/
    ├── index.js                 # Route aggregator (add page routes)
    ├── info.js                  # Phase 1 (complete)
    ├── admin.js                 # Phase 2 (complete)
    └── pages.js                 # NEW - Page routes
```

---

## 3. Execution Steps

### Step 4-1: Create routes/pages.js
- Copy 5 routes from server.js
- Verify: node --check routes/pages.js

### Step 4-2: Update routes/index.js
- Add pages routes to aggregator
- Verify: node --check routes/index.js

### Step 4-3: Verify Module Loading
- Test: node -e "require('./routes/pages')"
- Expected: 5 routes

### Step 4-4: Delete Old Routes from server.js
- Remove lines 516-542 (keep POST /contact)
- Verify: node --check server.js

### Step 4-5: Final Verification
- Syntax valid
- Routes registered
- Line count verified

---

## 4. Routes Detail

### GET /checkout
```javascript
app.get('/checkout', (req, res) => {
  res.render('checkout', { title: 'Checkout - LUXORA' });
});
```

### POST /checkout (VULN: logs credit card)
```javascript
app.post('/checkout', (req, res) => {
  const { cardNumber, expiry, cvv, name } = req.body;
  console.log('Payment received:', { cardNumber, expiry, cvv, name });
  res.redirect('/checkout/success');
});
```

### GET /checkout/success
```javascript
app.get('/checkout/success', (req, res) => {
  res.render('checkout-success', { title: 'Order Confirmed - LUXORA' });
});
```

### GET /about
```javascript
app.get('/about', (req, res) => {
  res.render('about', { title: 'About Us - LUXORA' });
});
```

### GET /contact
```javascript
app.get('/contact', (req, res) => {
  const sent = req.query.sent || null;
  res.render('contact', { title: 'Contact Us - LUXORA', sent });
});
```

---

## 5. Verification Checklist

- [ ] [FULL SURVEY FLOW] routes/pages.js created
- [ ] [FULL SURVEY FLOW] routes/index.js updated
- [ ] [FULL SURVEY FLOW] 5 routes verified
- [ ] [FULL SURVEY FLOW] Old routes deleted
- [ ] [FULL SURVEY FLOW] Syntax valid
- [ ] [FULL SURVEY FLOW] No dead references
