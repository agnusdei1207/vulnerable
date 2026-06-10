# Benchmark v2.0 Implementation Audit & Revision

> **Status**: Critical Gap Identified
> **Date**: 2026-02-26

---

## Problem Summary

The design document specifies 112 flags across 5 tiers, but the current `server.js` only implements ~25 vulnerabilities, all at Bronze (basic) level.

**Gap**: No Silver/Gold/Platinum/Diamond implementations exist.

---

## Solution: Tiered Vulnerability Implementation

### Principle: Progressive Hardening

Each tier adds complexity on top of the previous:

| Tier | Implementation Pattern |
|------|------------------------|
| 🥉 Bronze | Direct vulnerability, no protection |
| 🥈 Silver | Basic WAF/filter that can be bypassed |
| 🥇 Gold | Multi-step exploitation required |
| 💎 Platinum | Chaining multiple vulnerabilities |
| 🔱 Diamond | Requires custom tooling/research |

---

## Category-by-Category Implementation

### 1. SQL Injection (5 Tiers)

#### 🥉 Bronze: UNION-Based (EXISTS)
```
Route: GET /sqli/basic
Technique: ' UNION SELECT 1,2,flag FROM secrets--
Filter: None
```

#### 🥈 Silver: Blind Boolean-Based
```
Route: GET /sqli/blind
Technique: ' AND 1=1-- / ' AND 1=2--
Filter: Blocks UNION, SELECT keywords
Bypass: Case variation, comments
```

#### 🥇 Gold: Time-Based Blind
```
Route: GET /sqli/time
Technique: ' AND SLEEP(5)--
Filter: Blocks boolean responses, error messages disabled
Bypass: Time-based inference
```

#### 💎 Platinum: Second-Order SQLi
```
Route: POST /sqli/second-order → GET /admin/users
Technique: Inject in registration, trigger in admin panel
Filter: Input sanitized, but stored value executed later
Bypass: Stored XSS chain
```

#### 🔱 Diamond: Filter Bypass with WAF
```
Route: GET /sqli/waf
Technique: Unicode normalization, HTTP parameter pollution
Filter: Commercial-grade WAF simulation
Bypass: Advanced encoding, chunked requests
```

---

### 2. XSS (5 Tiers)

#### 🥉 Bronze: Reflected (EXISTS)
```
Route: GET /search-xss?q=<script>alert(1)</script>
Filter: None
```

#### 🥈 Silver: Stored XSS (EXISTS)
```
Route: POST /comments (stores), GET /comments (renders)
Filter: None
```

#### 🥇 Gold: DOM XSS (EXISTS)
```
Route: GET /dom-xss#<img src=x onerror=alert(1)>
Filter: None (client-side only)
```

#### 💎 Platinum: Mutation XSS
```
Route: GET /mhtml
Technique: Uses browser HTML parsing quirks
Filter: Basic XSS filter present
Bypass: <noscript><p title="</noscript><img src=x onerror=alert(1)>">
```

#### 🔱 Diamond: CSP Bypass
```
Route: GET /csp-xss
Technique: JSONP endpoint abuse, dangling markup
Filter: Strict CSP: default-src 'self'
Bypass: Find JSONP callback, use script gadget
```

---

### 3. Command Injection (4 Tiers)

#### 🥉 Bronze: Basic Pipe (EXISTS)
```
Route: GET /ping?host=127.0.0.1;cat /etc/passwd
Filter: None
```

#### 🥈 Silver: Backtick Injection
```
Route: GET /dns?domain=`id`
Filter: Blocks semicolons, pipes
Bypass: Backticks, $()
```

#### 🥇 Gold: Unicode Bypass
```
Route: GET /cmd2?input=test
Technique: Unicode normalization bypass
Filter: Blocks common separators
Bypass: \u0020, %0a, unicode alternatives
```

#### 💎 Platinum: Blind Command Injection
```
Route: POST /webhook
Technique: Out-of-band data exfiltration
Filter: No output returned
Bypass: DNS/HTTP callback to attacker server
```

---

### 4. SSRF (4 Tiers)

#### 🥉 Bronze: Basic URL (EXISTS)
```
Route: GET /fetch?url=http://127.0.0.1:8080
Filter: None
```

#### 🥈 Silver: Cloud Metadata (EXISTS - partial)
```
Route: GET /fetch?url=http://169.254.169.254/latest/meta-data/
Filter: Basic keyword block
Bypass: IP in different format (0x7f000001)
```

#### 🥇 Gold: DNS Rebinding
```
Route: GET /fetch-timeout?url=http://attacker-controlled.com
Technique: TTL=1 DNS, resolve to 127.0.0.1 after check
Filter: Validates IP before request
Bypass: Race condition with DNS rebinding
```

#### 💎 Platinum: Protocol Smuggling
```
Route: GET /proxy?url=gopher://127.0.0.1:6379/_*
Technique: Gopher/Dict protocol abuse
Filter: Only allows http/https
Bypass: URL parsing confusion, redirect chains
```

---

### 5. Path Traversal/LFI (4 Tiers)

#### 🥉 Bronze: Basic Traversal (EXISTS)
```
Route: GET /download?file=../../../etc/passwd
Filter: None
```

#### 🥈 Silver: Double Encoding
```
Route: GET /read-file?path=....//....//etc/passwd
Filter: Blocks ../
Bypass: ....//, double encoding, ..%252f
```

#### 🥇 Gold: Wrapper Abuse
```
Route: GET /include?page=php://filter/convert.base64-encode/resource=config
Technique: PHP wrappers (if simulated)
Filter: Blocks direct traversal
Bypass: Wrapper protocols
```

#### 💎 Platinum: Log Poisoning → RCE
```
Route: POST /log (inject) → GET /include?page=/var/log/app.log
Technique: Inject PHP code into logs, include logs
Filter: Logs not directly accessible
Bypass: Combine LFI + Log Injection
```

---

### 6. JWT (4 Tiers)

#### 🥉 Bronze: None Algorithm (EXISTS - partial)
```
Route: GET /jwt?alg=none
Technique: Change alg to none, remove signature
Filter: None
```

#### 🥈 Silver: Weak Secret
```
Route: POST /auth/jwt
Technique: Crack weak secret with jwt-tool
Filter: Requires signature
Bypass: Dictionary attack on secret
```

#### 🥇 Gold: Kid Injection
```
Route: POST /auth/jwt-kid
Technique: kid parameter points to /dev/null or attacker file
Filter: Validates signature
Bypass: Control the key file via kid
```

#### 💎 Platinum: Jku Spoofing
```
Route: POST /auth/jwt-jku
Technique: Host malicious JWKS, point jku to it
Filter: Fetches keys from jku URL
Bypass: Host attacker-controlled JWKS
```

---

### 7. XXE (4 Tiers)

#### 🥉 Bronze: Basic Entity (EXISTS)
```
Route: POST /xml
Technique: <!ENTITY xxe SYSTEM "file:///etc/passwd">
Filter: None
```

#### 🥈 Silver: Blind OOBE
```
Route: POST /xml-blind
Technique: Out-of-band entity exfiltration
Filter: No response body
Bypass: DNS/HTTP callback
```

#### 🥇 Gold: DTD Upload
```
Route: POST /upload (DTD) → POST /xml-with-dtd
Technique: Upload malicious DTD, reference it
Filter: Blocks SYSTEM keyword
Bypass: Use uploaded DTD file
```

#### 💎 Platinum: XInclude
```
Route: POST /xml-xinclude
Technique: <xi:include href="file:///etc/passwd"/>
Filter: Blocks DOCTYPE/ENTITY
Bypass: XInclude namespace
```

---

### 8. Privilege Escalation (5 Tiers)

#### 🥉 Bronze: Sudo Abuse (EXISTS in Docker)
```
Technique: sudo find . -exec /bin/sh \;
Context: Container with sudo NOPASSWD for find
```

#### 🥈 Silver: SUID Binary
```
Technique: Find SUID binaries, GTFOBins exploitation
Context: SUID binary with known privesc path
```

#### 🥇 Gold: Kernel Exploit
```
Technique: CVE-based kernel exploitation
Context: Vulnerable kernel version
```

#### 💎 Platinum: Container Escape
```
Technique: Docker socket mount, privileged container
Context: Container with /var/run/docker.sock
```

#### 🔱 Diamond: Cloud Metadata → IAM
```
Technique: SSRF to cloud metadata, IAM role assumption
Context: Cloud environment simulation
```

---

## Implementation Roadmap

### Phase 1: Add Tiered Routes (Priority: HIGH)

Each category needs new routes for Silver/Gold/Platinum/Diamond:

```javascript
// Example: SQL Injection Tier System
app.get('/sqli/bronze', ...);    // No filter
app.get('/sqli/silver', ...);    // Keyword filter
app.get('/sqli/gold', ...);      // Time-based only
app.get('/sqli/platinum', ...);  // Second-order
app.get('/sqli/diamond', ...);   // WAF bypass
```

### Phase 2: Implement Filter Classes

```javascript
// app/lib/filters.js
class WAF {
  constructor(level) { this.level = level; }

  check(input) {
    if (this.level >= 1) { /* Silver: basic keywords */ }
    if (this.level >= 2) { /* Gold: case variations */ }
    if (this.level >= 3) { /* Platinum: encoding */ }
    if (this.level >= 4) { /* Diamond: advanced ML/regex */ }
    return { blocked: false, sanitized: input };
  }
}
```

### Phase 3: Flag File Updates

Each flag file must correspond to an actual exploitable endpoint:

```
app/flags/
├── injection/
│   └── sqli/
│       ├── sqli_bronze.txt    ← GET /sqli/bronze
│       ├── sqli_silver.txt    ← GET /sqli/silver
│       ├── sqli_gold.txt      ← GET /sqli/gold
│       ├── sqli_platinum.txt  ← GET /sqli/platinum
│       └── sqli_diamond.txt   ← GET /sqli/diamond
```

---

## Verification Checklist

For each flag, verify:

- [ ] Route exists in server.js
- [ ] Vulnerability is exploitable at specified tier level
- [ ] Filter/bypass matches tier description
- [ ] Flag file is accessible only via correct exploitation
- [ ] Cannot bypass tier (e.g., Bronze flag via Gold route)

---

## Next Steps

1. **Implement tiered routes** for each category
2. **Add filter middleware** for Silver+ tiers
3. **Create verification tests** for each flag
4. **Update server.js** with all new endpoints
5. **Generate flag files** matching actual routes
