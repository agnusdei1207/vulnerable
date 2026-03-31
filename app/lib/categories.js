/**
 * Benchmark Category Definitions
 * Defines all 112 flags across 10 categories with techniques and tiers
 */

const CATEGORIES = {
  // ============================================
  // INJECTION LAYER (28 flags)
  // ============================================
  INJECTION: {
    id: 'INJECTION',
    name: 'Injection Layer',
    description: 'Various code injection vulnerabilities',
    flags: {
      SQLI: {
        id: 'SQLI',
        name: 'SQL Injection',
        description: 'Database query manipulation attacks',
        techniques: {
          BRONZE: { name: 'UNION-Based', technique: 'UNION_BASED', route: '/sqli/bronze' },
          SILVER: { name: 'Blind Boolean', technique: 'BLIND_BOOLEAN', route: '/sqli/silver' },
          GOLD: { name: 'Time-Based Blind', technique: 'TIME_BASED', route: '/sqli/gold' },
          PLATINUM: { name: 'Second-Order', technique: 'SECOND_ORDER', route: '/sqli/platinum' },
          DIAMOND: { name: 'WAF Bypass', technique: 'WAF_BYPASS', route: '/sqli/diamond' }
        }
      },
      NOSQLI: {
        id: 'NOSQLI',
        name: 'NoSQL Injection',
        description: 'NoSQL database query manipulation',
        techniques: {
          BRONZE: { name: 'Basic Operator', technique: 'BASIC_OPERATOR', route: '/nosqli/bronze' },
          SILVER: { name: '$where Injection', technique: 'WHERE_INJECTION', route: '/nosqli/silver' },
          GOLD: { name: 'Blind NoSQLi', technique: 'BLIND_NOSQLI', route: '/nosqli/gold' }
        }
      },
      CMDI: {
        id: 'CMDI',
        name: 'Command Injection',
        description: 'OS command execution attacks',
        techniques: {
          BRONZE: { name: 'Basic Pipe', technique: 'BASIC_PIPE', route: '/cmdi/bronze' },
          SILVER: { name: 'Backtick Injection', technique: 'BACKTICK', route: '/cmdi/silver' },
          GOLD: { name: 'Unicode Bypass', technique: 'UNICODE_BYPASS', route: '/cmdi/gold' },
          PLATINUM: { name: 'Blind Command', technique: 'BLIND_COMMAND', route: '/cmdi/platinum' }
        }
      },
      LDAP: {
        id: 'LDAP',
        name: 'LDAP Injection',
        description: 'LDAP query manipulation',
        techniques: {
          BRONZE: { name: 'Basic Filter', technique: 'BASIC_FILTER', route: '/ldap/bronze' },
          SILVER: { name: 'Blind LDAP', technique: 'BLIND_LDAP', route: '/ldap/silver' }
        }
      },
      XPATH: {
        id: 'XPATH',
        name: 'XPath Injection',
        description: 'XML XPath query manipulation',
        techniques: {
          BRONZE: { name: 'Basic XPath', technique: 'BASIC_XPATH', route: '/xpath/bronze' },
          SILVER: { name: 'Blind XPath', technique: 'BLIND_XPATH', route: '/xpath/silver' }
        }
      },
      SSTI: {
        id: 'SSTI',
        name: 'Template Injection',
        description: 'Server-side template code execution',
        techniques: {
          BRONZE: { name: 'Basic Echo', technique: 'BASIC_ECHO', route: '/ssti/bronze' },
          SILVER: { name: 'RCE via SSTI', technique: 'RCE_TEMPLATE', route: '/ssti/silver' },
          GOLD: { name: 'Sandbox Escape', technique: 'SANDBOX_ESCAPE', route: '/ssti/gold' }
        }
      },
      LOG_INJECT: {
        id: 'LOG_INJECT',
        name: 'Log Injection',
        description: 'Log file manipulation attacks',
        techniques: {
          BRONZE: { name: 'CRLF in Logs', technique: 'CRLF_LOGS', route: '/log-inject/bronze' },
          SILVER: { name: 'Log Poisoning', technique: 'LOG_POISONING', route: '/log-inject/silver' }
        }
      },
      EMAIL_INJECT: {
        id: 'EMAIL_INJECT',
        name: 'Email Header Injection',
        description: 'Email header manipulation',
        techniques: {
          BRONZE: { name: 'Basic CRLF', technique: 'BASIC_CRLF', route: '/email-inject/bronze' },
          SILVER: { name: 'BCC Injection', technique: 'BCC_INJECTION', route: '/email-inject/silver' }
        }
      },
      CRLF: {
        id: 'CRLF',
        name: 'CRLF Injection',
        description: 'HTTP response splitting',
        techniques: {
          BRONZE: { name: 'Response Splitting', technique: 'RESPONSE_SPLIT', route: '/crlf/bronze' },
          SILVER: { name: 'Cache Poisoning', technique: 'CACHE_POISON_CRLF', route: '/crlf/silver' }
        }
      },
      HEADER_INJECT: {
        id: 'HEADER_INJECT',
        name: 'Header Injection',
        description: 'HTTP header manipulation',
        techniques: {
          BRONZE: { name: 'X-Forwarded-For', technique: 'X_FORWARDED', route: '/header-inject/bronze' },
          SILVER: { name: 'Host Bypass', technique: 'HOST_BYPASS', route: '/header-inject/silver' }
        }
      }
    }
  },

  // ============================================
  // AUTHENTICATION LAYER (20 flags)
  // ============================================
  AUTH: {
    id: 'AUTH',
    name: 'Authentication Layer',
    description: 'Authentication and session vulnerabilities',
    flags: {
      BRUTE: {
        id: 'BRUTE',
        name: 'Brute Force',
        description: 'Credential guessing attacks',
        techniques: {
          BRONZE: { name: 'Basic Brute', technique: 'BASIC_BRUTE', route: '/brute/bronze' },
          SILVER: { name: 'CAPTCHA Bypass', technique: 'CAPTCHA_BYPASS', route: '/brute/silver' },
          GOLD: { name: 'Rate Limit Bypass', technique: 'RATELIMIT_BYPASS', route: '/brute/gold' }
        }
      },
      JWT: {
        id: 'JWT',
        name: 'JWT Attacks',
        description: 'JSON Web Token vulnerabilities',
        techniques: {
          BRONZE: { name: 'None Algorithm', technique: 'NONE_ALG', route: '/jwt/bronze' },
          SILVER: { name: 'Weak Secret', technique: 'WEAK_SECRET', route: '/jwt/silver' },
          GOLD: { name: 'Kid Injection', technique: 'KID_INJECTION', route: '/jwt/gold' },
          PLATINUM: { name: 'Jku Spoofing', technique: 'JKU_SPOOFING', route: '/jwt/platinum' }
        }
      },
      SESSION: {
        id: 'SESSION',
        name: 'Session Attacks',
        description: 'Session management vulnerabilities',
        techniques: {
          BRONZE: { name: 'Session Fixation', technique: 'FIXATION', route: '/session/bronze' },
          SILVER: { name: 'Session Hijacking', technique: 'HIJACKING', route: '/session/silver' },
          GOLD: { name: 'Predictable Token', technique: 'PREDICTABLE_TOKEN', route: '/session/gold' }
        }
      },
      OAUTH: {
        id: 'OAUTH',
        name: 'OAuth Misconfig',
        description: 'OAuth implementation flaws',
        techniques: {
          BRONZE: { name: 'Open Redirect', technique: 'OPEN_REDIRECT_OAUTH', route: '/oauth/bronze' },
          SILVER: { name: 'CSRF in OAuth', technique: 'CSRF_OAUTH', route: '/oauth/silver' },
          GOLD: { name: 'Token Leakage', technique: 'TOKEN_LEAKAGE', route: '/oauth/gold' }
        }
      },
      PASS_RESET: {
        id: 'PASS_RESET',
        name: 'Password Reset',
        description: 'Password reset vulnerabilities',
        techniques: {
          BRONZE: { name: 'Token Prediction', technique: 'TOKEN_PREDICTION', route: '/pass-reset/bronze' },
          SILVER: { name: 'Host Header Reset', technique: 'HOST_HEADER_RESET', route: '/pass-reset/silver' }
        }
      },
      MFA: {
        id: 'MFA',
        name: 'MFA Bypass',
        description: 'Multi-factor authentication bypasses',
        techniques: {
          BRONZE: { name: 'Response Manipulation', technique: 'RESPONSE_MANIPULATION', route: '/mfa/bronze' },
          SILVER: { name: 'MFA Brute Force', technique: 'MFA_BRUTE', route: '/mfa/silver' },
          GOLD: { name: 'Backup Code Abuse', technique: 'BACKUP_CODE', route: '/mfa/gold' }
        }
      },
      ATO: {
        id: 'ATO',
        name: 'Account Takeover',
        description: 'Full account compromise attacks',
        techniques: {
          BRONZE: { name: 'Email Change', technique: 'EMAIL_CHANGE', route: '/ato/bronze' },
          SILVER: { name: 'Password Reuse', technique: 'PASSWORD_REUSE', route: '/ato/silver' }
        }
      }
    }
  },

  // ============================================
  // ACCESS CONTROL LAYER (16 flags)
  // ============================================
  ACCESS: {
    id: 'ACCESS',
    name: 'Access Control Layer',
    description: 'Authorization and access control vulnerabilities',
    flags: {
      IDOR: {
        id: 'IDOR',
        name: 'IDOR',
        description: 'Insecure Direct Object Reference',
        techniques: {
          BRONZE: { name: 'Direct ID', technique: 'DIRECT_ID', route: '/idor/bronze' },
          SILVER: { name: 'GUID Enumeration', technique: 'GUID_ENUM', route: '/idor/silver' },
          GOLD: { name: 'Bulk Export', technique: 'BULK_EXPORT', route: '/idor/gold' },
          PLATINUM: { name: 'Chained IDOR', technique: 'CHAINED_IDOR', route: '/idor/platinum' }
        }
      },
      PRIVESC: {
        id: 'PRIVESC',
        name: 'Privilege Escalation',
        description: 'Elevating privileges on the system',
        techniques: {
          BRONZE: { name: 'Sudo Abuse', technique: 'SUDO_ABUSE', route: '/privesc/bronze' },
          SILVER: { name: 'SUID Binary', technique: 'SUID_BINARY', route: '/privesc/silver' },
          GOLD: { name: 'Kernel Exploit', technique: 'KERNEL_EXPLOIT', route: '/privesc/gold' },
          PLATINUM: { name: 'Container Escape', technique: 'CONTAINER_ESCAPE', route: '/privesc/platinum' },
          DIAMOND: { name: 'Cloud Metadata', technique: 'CLOUD_META', route: '/privesc/diamond' }
        }
      },
      ADMIN: {
        id: 'ADMIN',
        name: 'Admin Bypass',
        description: 'Administrative access bypasses',
        techniques: {
          BRONZE: { name: 'Cookie Manipulation', technique: 'COOKIE_MANIPULATION', route: '/admin/bronze' },
          SILVER: { name: 'Force Browsing', technique: 'FORCE_BROWSING', route: '/admin/silver' },
          GOLD: { name: 'Role Bypass', technique: 'ROLE_BYPASS', route: '/admin/gold' }
        }
      },
      RBAC: {
        id: 'RBAC',
        name: 'RBAC Bypass',
        description: 'Role-based access control bypasses',
        techniques: {
          BRONZE: { name: 'Parameter Tampering', technique: 'PARAMETER_TAMPERING', route: '/rbac/bronze' },
          SILVER: { name: 'Token Abuse', technique: 'TOKEN_ABUSE', route: '/rbac/silver' },
          GOLD: { name: 'Policy Bypass', technique: 'POLICY_BYPASS', route: '/rbac/gold' },
          PLATINUM: { name: 'Cross-Tenant', technique: 'CROSS_TENANT', route: '/rbac/platinum' }
        }
      }
    }
  },

  // ============================================
  // CLIENT-SIDE LAYER (12 flags)
  // ============================================
  CLIENT: {
    id: 'CLIENT',
    name: 'Client-Side Layer',
    description: 'Client-side security vulnerabilities',
    flags: {
      XSS: {
        id: 'XSS',
        name: 'XSS',
        description: 'Cross-Site Scripting attacks',
        techniques: {
          BRONZE: { name: 'Reflected', technique: 'REFLECTED', route: '/xss/bronze' },
          SILVER: { name: 'Stored', technique: 'STORED', route: '/xss/silver' },
          GOLD: { name: 'DOM-Based', technique: 'DOM_BASED', route: '/xss/gold' },
          PLATINUM: { name: 'Mutation XSS', technique: 'MUTATION', route: '/xss/platinum' },
          DIAMOND: { name: 'CSP Bypass', technique: 'CSP_BYPASS', route: '/xss/diamond' }
        }
      },
      CSRF: {
        id: 'CSRF',
        name: 'CSRF',
        description: 'Cross-Site Request Forgery',
        techniques: {
          BRONZE: { name: 'Basic Token', technique: 'BASIC_TOKEN', route: '/csrf/bronze' },
          SILVER: { name: 'JSON CSRF', technique: 'JSON_CSRF', route: '/csrf/silver' },
          GOLD: { name: 'SameSite Bypass', technique: 'SAMESITE_BYPASS', route: '/csrf/gold' }
        }
      },
      CLICKJACK: {
        id: 'CLICKJACK',
        name: 'Clickjacking',
        description: 'UI redress attacks',
        techniques: {
          BRONZE: { name: 'Basic Frame', technique: 'BASIC_FRAME', route: '/clickjack/bronze' },
          SILVER: { name: 'X-Frame-Options Bypass', technique: 'XFRAME_BYPASS', route: '/clickjack/silver' }
        }
      },
      POSTMSG: {
        id: 'POSTMSG',
        name: 'PostMessage Abuse',
        description: 'window.postMessage vulnerabilities',
        techniques: {
          BRONZE: { name: 'Origin Bypass', technique: 'ORIGIN_BYPASS', route: '/postmsg/bronze' },
          SILVER: { name: 'Data Exfiltration', technique: 'DATA_EXFIL', route: '/postmsg/silver' }
        }
      }
    }
  },

  // ============================================
  // FILE & RESOURCE LAYER (16 flags)
  // ============================================
  FILE: {
    id: 'FILE',
    name: 'File & Resource Layer',
    description: 'File handling vulnerabilities',
    flags: {
      LFI: {
        id: 'LFI',
        name: 'Path Traversal',
        description: 'Local file inclusion attacks',
        techniques: {
          BRONZE: { name: 'Basic Traversal', technique: 'BASIC_TRAVERSAL', route: '/lfi/bronze' },
          SILVER: { name: 'Double Encoding', technique: 'DOUBLE_ENCODING', route: '/lfi/silver' },
          GOLD: { name: 'Wrapper Abuse', technique: 'WRAPPER', route: '/lfi/gold' },
          PLATINUM: { name: 'Log Poisoning', technique: 'LOG_POISONING_LFI', route: '/lfi/platinum' }
        }
      },
      UPLOAD: {
        id: 'UPLOAD',
        name: 'File Upload',
        description: 'Malicious file upload attacks',
        techniques: {
          BRONZE: { name: 'Extension Bypass', technique: 'EXTENSION_BYPASS', route: '/upload/bronze' },
          SILVER: { name: 'Content-Type Bypass', technique: 'CONTENTTYPE_BYPASS', route: '/upload/silver' },
          GOLD: { name: 'Polyglot File', technique: 'POLYGLOT', route: '/upload/gold' }
        }
      },
      XXE: {
        id: 'XXE',
        name: 'XXE',
        description: 'XML External Entity attacks',
        techniques: {
          BRONZE: { name: 'Basic Entity', technique: 'BASIC_ENTITY', route: '/xxe/bronze' },
          SILVER: { name: 'Blind OOBE', technique: 'BLIND_OOBE', route: '/xxe/silver' },
          GOLD: { name: 'DTD Upload', technique: 'DTD_UPLOAD', route: '/xxe/gold' },
          PLATINUM: { name: 'XInclude', technique: 'XINCLUDE', route: '/xxe/platinum' }
        }
      },
      RFI: {
        id: 'RFI',
        name: 'RFI',
        description: 'Remote file inclusion',
        techniques: {
          BRONZE: { name: 'Basic Include', technique: 'BASIC_INCLUDE', route: '/rfi/bronze' },
          SILVER: { name: 'Double Extension', technique: 'DOUBLE_EXTENSION', route: '/rfi/silver' }
        }
      },
      DESER: {
        id: 'DESER',
        name: 'Deserialization',
        description: 'Insecure deserialization attacks',
        techniques: {
          BRONZE: { name: 'Node.js Deser', technique: 'NODE_DESER', route: '/deser/bronze' },
          SILVER: { name: 'Java Deser', technique: 'JAVA_DESER', route: '/deser/silver' },
          GOLD: { name: 'PHP Deser', technique: 'PHP_DESER', route: '/deser/gold' }
        }
      }
    }
  },

  // ============================================
  // SERVER-SIDE LAYER (14 flags)
  // ============================================
  SERVER: {
    id: 'SERVER',
    name: 'Server-Side Layer',
    description: 'Server-side security vulnerabilities',
    flags: {
      SSRF: {
        id: 'SSRF',
        name: 'SSRF',
        description: 'Server-Side Request Forgery',
        techniques: {
          BRONZE: { name: 'Basic URL', technique: 'BASIC_URL', route: '/ssrf/bronze' },
          SILVER: { name: 'Cloud Metadata', technique: 'CLOUD_METADATA', route: '/ssrf/silver' },
          GOLD: { name: 'DNS Rebinding', technique: 'DNS_REBINDING', route: '/ssrf/gold' },
          PLATINUM: { name: 'Protocol Smuggling', technique: 'PROTOCOL_SMUGGLE', route: '/ssrf/platinum' }
        }
      },
      PROTO_POLLUTE: {
        id: 'PROTO_POLLUTE',
        name: 'Prototype Pollution',
        description: 'JavaScript prototype pollution',
        techniques: {
          BRONZE: { name: 'Basic Merge', technique: 'BASIC_MERGE', route: '/proto/bronze' },
          SILVER: { name: 'RCE Chain', technique: 'RCE_CHAIN', route: '/proto/silver' },
          GOLD: { name: 'Safe Mode Bypass', technique: 'SAFE_MODE_BYPASS', route: '/proto/gold' }
        }
      },
      RACE: {
        id: 'RACE',
        name: 'Race Condition',
        description: 'TOCTOU and race condition attacks',
        techniques: {
          BRONZE: { name: 'TOCTOU', technique: 'TOCTOU', route: '/race/bronze' },
          SILVER: { name: 'Coupon Race', technique: 'COUPON_RACE', route: '/race/silver' },
          GOLD: { name: 'Balance Race', technique: 'BALANCE_RACE', route: '/race/gold' }
        }
      },
      SMUGGLE: {
        id: 'SMUGGLE',
        name: 'HTTP Request Smuggling',
        description: 'Request smuggling attacks',
        techniques: {
          BRONZE: { name: 'CL.TE', technique: 'CL_TE', route: '/smuggle/bronze' },
          SILVER: { name: 'TE.CL', technique: 'TE_CL', route: '/smuggle/silver' }
        }
      },
      CACHE: {
        id: 'CACHE',
        name: 'Cache Poisoning',
        description: 'Web cache poisoning attacks',
        techniques: {
          BRONZE: { name: 'Basic Header', technique: 'BASIC_HEADER_CACHE', route: '/cache/bronze' },
          SILVER: { name: 'Fat GET', technique: 'FAT_GET', route: '/cache/silver' }
        }
      }
    }
  },

  // ============================================
  // LOGIC & BUSINESS LAYER (10 flags)
  // ============================================
  LOGIC: {
    id: 'LOGIC',
    name: 'Logic & Business Layer',
    description: 'Business logic vulnerabilities',
    flags: {
      BIZ_LOGIC: {
        id: 'BIZ_LOGIC',
        name: 'Business Logic',
        description: 'Business process manipulation',
        techniques: {
          BRONZE: { name: 'Price Manipulation', technique: 'PRICE_MANIPULATION', route: '/logic/bronze' },
          SILVER: { name: 'Inventory Race', technique: 'INVENTORY_RACE', route: '/logic/silver' },
          GOLD: { name: 'Coupon Stack', technique: 'COUPON_STACK', route: '/logic/gold' },
          PLATINUM: { name: 'Refund Abuse', technique: 'REFUND_ABUSE', route: '/logic/platinum' }
        }
      },
      RATELIMIT: {
        id: 'RATELIMIT',
        name: 'Rate Limit Bypass',
        description: 'Rate limiting evasion',
        techniques: {
          BRONZE: { name: 'IP Rotation', technique: 'IP_ROTATION', route: '/ratelimit/bronze' },
          SILVER: { name: 'Header Manipulation', technique: 'HEADER_MANIPULATION', route: '/ratelimit/silver' }
        }
      },
      PAYMENT: {
        id: 'PAYMENT',
        name: 'Payment Manipulation',
        description: 'Payment process vulnerabilities',
        techniques: {
          BRONZE: { name: 'Amount Tampering', technique: 'AMOUNT_TAMPERING', route: '/payment/bronze' },
          SILVER: { name: 'Currency Switch', technique: 'CURRENCY_SWITCH', route: '/payment/silver' },
          GOLD: { name: 'Discount Stack', technique: 'DISCOUNT_STACK', route: '/payment/gold' },
          PLATINUM: { name: 'Free Purchase', technique: 'FREE_PURCHASE', route: '/payment/platinum' }
        }
      }
    }
  },

  // ============================================
  // CRYPTO & SECRETS LAYER (12 flags)
  // ============================================
  CRYPTO: {
    id: 'CRYPTO',
    name: 'Crypto & Secrets Layer',
    description: 'Cryptographic vulnerabilities',
    flags: {
      WEAK_CRYPTO: {
        id: 'WEAK_CRYPTO',
        name: 'Weak Crypto',
        description: 'Cryptographic implementation flaws',
        techniques: {
          BRONZE: { name: 'ECB Mode', technique: 'ECB_MODE', route: '/crypto/bronze' },
          SILVER: { name: 'Weak Random', technique: 'WEAK_RANDOM', route: '/crypto/silver' },
          GOLD: { name: 'Padding Oracle', technique: 'PADDING_ORACLE', route: '/crypto/gold' }
        }
      },
      INFO_DISC: {
        id: 'INFO_DISC',
        name: 'Info Disclosure',
        description: 'Information leakage vulnerabilities',
        techniques: {
          BRONZE: { name: 'Debug Mode', technique: 'DEBUG_MODE', route: '/info-disc/bronze' },
          SILVER: { name: 'Stack Trace', technique: 'STACK_TRACE', route: '/info-disc/silver' },
          GOLD: { name: 'Config Leak', technique: 'CONFIG_LEAK', route: '/info-disc/gold' },
          PLATINUM: { name: 'Backup Files', technique: 'BACKUP_FILES', route: '/info-disc/platinum' }
        }
      },
      SECRET: {
        id: 'SECRET',
        name: 'Secret Leakage',
        description: 'Credential and secret exposure',
        techniques: {
          BRONZE: { name: 'API Key in JS', technique: 'API_KEY_JS', route: '/secret/bronze' },
          SILVER: { name: 'Git Exposed', technique: 'GIT_EXPOSED', route: '/secret/silver' },
          GOLD: { name: 'Env File', technique: 'ENV_FILE', route: '/secret/gold' }
        }
      },
      TIMING: {
        id: 'TIMING',
        name: 'Timing Attack',
        description: 'Timing-based side channel attacks',
        techniques: {
          BRONZE: { name: 'Token Comparison', technique: 'TOKEN_COMPARISON', route: '/timing/bronze' },
          SILVER: { name: 'Password Check', technique: 'PASSWORD_CHECK', route: '/timing/silver' }
        }
      }
    }
  },

  // ============================================
  // INFRASTRUCTURE LAYER (10 flags)
  // ============================================
  INFRA: {
    id: 'INFRA',
    name: 'Infrastructure Layer',
    description: 'Infrastructure security vulnerabilities',
    flags: {
      REDIRECT: {
        id: 'REDIRECT',
        name: 'Open Redirect',
        description: 'URL redirection vulnerabilities',
        techniques: {
          BRONZE: { name: 'Basic URL', technique: 'BASIC_URL_REDIRECT', route: '/redirect/bronze' },
          SILVER: { name: 'JavaScript Redirect', technique: 'JS_REDIRECT', route: '/redirect/silver' }
        }
      },
      CORS: {
        id: 'CORS',
        name: 'CORS Misconfig',
        description: 'Cross-Origin Resource Sharing flaws',
        techniques: {
          BRONZE: { name: 'Reflect Origin', technique: 'REFLECT_ORIGIN', route: '/cors/bronze' },
          SILVER: { name: 'Null Origin', technique: 'NULL_ORIGIN', route: '/cors/silver' },
          GOLD: { name: 'Credentialed', technique: 'CREDENTIALED', route: '/cors/gold' }
        }
      },
      HOST: {
        id: 'HOST',
        name: 'Host Header',
        description: 'Host header injection',
        techniques: {
          BRONZE: { name: 'Password Reset', technique: 'PASSWORD_RESET_HOST', route: '/host/bronze' },
          SILVER: { name: 'Cache Poison', technique: 'CACHE_POISON_HOST', route: '/host/silver' }
        }
      },
      CONTAINER: {
        id: 'CONTAINER',
        name: 'Container Escape',
        description: 'Container breakout attacks',
        techniques: {
          BRONZE: { name: 'Docker Socket', technique: 'DOCKER_SOCKET', route: '/container/bronze' },
          SILVER: { name: 'Privileged Container', technique: 'PRIVILEGED_CONTAINER', route: '/container/silver' },
          GOLD: { name: 'Kernel CVE', technique: 'KERNEL_CVE', route: '/container/gold' }
        }
      }
    }
  },

  // ============================================
  // ADVANCED LAYER (14 flags)
  // ============================================
  ADVANCED: {
    id: 'ADVANCED',
    name: 'Advanced Layer',
    description: 'Advanced multi-step attacks',
    flags: {
      REVERSE: {
        id: 'REVERSE',
        name: 'Reversing Chain',
        description: 'Code reversing challenges',
        techniques: {
          BRONZE: { name: 'JS Obfuscation', technique: 'JS_OBFUSCATION', route: '/reverse/bronze' },
          SILVER: { name: 'WebAssembly', technique: 'WEBAASSEMBLY', route: '/reverse/silver' },
          GOLD: { name: 'Native Binary', technique: 'NATIVE_BINARY', route: '/reverse/gold' },
          PLATINUM: { name: 'Anti-Debug', technique: 'ANTI_DEBUG', route: '/reverse/platinum' }
        }
      },
      WEBSHELL: {
        id: 'WEBSHELL',
        name: 'Web Shell',
        description: 'Web shell deployment and usage',
        techniques: {
          BRONZE: { name: 'Basic Upload', technique: 'BASIC_UPLOAD_SHELL', route: '/webshell/bronze' },
          SILVER: { name: 'Hidden Shell', technique: 'HIDDEN_SHELL', route: '/webshell/silver' },
          GOLD: { name: 'Memory Resident', technique: 'MEMORY_RESIDENT', route: '/webshell/gold' }
        }
      },
      MULTISTAGE: {
        id: 'MULTISTAGE',
        name: 'Multi-Stage Attack',
        description: 'Complex attack chains',
        techniques: {
          BRONZE: { name: 'Recon→Exploit→Privesc', technique: 'RECON_EXPLOIT_PRIVESC', route: '/multistage/bronze' },
          SILVER: { name: 'Pivot', technique: 'PIVOT', route: '/multistage/silver' },
          GOLD: { name: 'Persistence', technique: 'PERSISTENCE', route: '/multistage/gold' },
          PLATINUM: { name: 'Exfiltration', technique: 'EXFILTRATE', route: '/multistage/platinum' }
        }
      },
      PERSIST: {
        id: 'PERSIST',
        name: 'Persistence',
        description: 'Maintaining access',
        techniques: {
          BRONZE: { name: 'Backdoor Account', technique: 'BACKDOOR_ACCOUNT', route: '/persist/bronze' },
          SILVER: { name: 'Cron Job', technique: 'CRON_JOB', route: '/persist/silver' },
          GOLD: { name: 'Startup Script', technique: 'STARTUP_SCRIPT', route: '/persist/gold' }
        }
      }
    }
  }
};

/**
 * Get all flags as a flat array
 * @returns {Array} Array of flag objects
 */
const getAllFlags = () => {
  const flags = [];

  Object.entries(CATEGORIES).forEach(([catKey, category]) => {
    Object.entries(category.flags).forEach(([flagKey, flag]) => {
      Object.entries(flag.techniques).forEach(([tier, tech]) => {
        flags.push({
          id: `${flagKey}_${tier}`,
          category: catKey,
          categoryId: category.id,
          categoryName: category.name,
          flagId: flag.id,
          flagName: flag.name,
          flagDescription: flag.description,
          tier: tier,
          technique: tech.technique,
          techniqueName: tech.name,
          route: tech.route
        });
      });
    });
  });

  return flags;
};

/**
 * Get flag by ID
 * @param {string} id - Flag ID (e.g., 'SQLI_BRONZE')
 * @returns {object|null} Flag object or null
 */
const getFlagById = (id) => {
  return getAllFlags().find(f => f.id === id) || null;
};

/**
 * Get flags by category
 * @param {string} categoryId - Category ID
 * @returns {Array} Array of flags in the category
 */
const getFlagsByCategory = (categoryId) => {
  return getAllFlags().filter(f => f.category === categoryId);
};

/**
 * Get flags by tier
 * @param {string} tier - Tier name
 * @returns {Array} Array of flags in the tier
 */
const getFlagsByTier = (tier) => {
  return getAllFlags().filter(f => f.tier === tier);
};

/**
 * Get category statistics
 * @returns {Array} Array of category stats
 */
const getCategoryStats = () => {
  return Object.entries(CATEGORIES).map(([key, cat]) => {
    const flags = getFlagsByCategory(key);
    return {
      id: key,
      name: cat.name,
      description: cat.description,
      flagCount: flags.length,
      maxScore: flags.reduce((sum, f) => {
        const { TIERS } = require('./tiers');
        return sum + (TIERS[f.tier]?.points || 0);
      }, 0)
    };
  });
};

module.exports = {
  CATEGORIES,
  getAllFlags,
  getFlagById,
  getFlagsByCategory,
  getFlagsByTier,
  getCategoryStats
};
