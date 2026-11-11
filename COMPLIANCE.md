# mcp-authscan Compliance Mapping

This document maps mcp-authscan security checks to industry-standard vulnerability classifications and compliance frameworks.

---

## Check 1: Endpoint Reachability

**Purpose:** Verify that MCP endpoints are discoverable and respond to requests.

| Framework | Classification | Reference |
|-----------|-----------------|-----------|
| **CWE** | N/A (informational) | — |
| **OWASP Top 10** | Not directly mapped | Prerequisite for other checks |
| **NIST CSF** | ID.AM-1 (Asset inventory) | Identify function |
| **CVSS v3.1** | N/A (INFO severity) | Not a vulnerability |

**Interpretation:** Endpoints that don't respond may indicate misconfiguration. INFO-level finding flags networks for review.

---

## Check 2: SSE Endpoint Authentication

**Purpose:** Verify that GET /sse requires Authorization header before streaming events.

| Framework | Classification | Reference |
|-----------|-----------------|-----------|
| **CWE** | CWE-306: Missing Authentication for Critical Function | https://cwe.mitre.org/data/definitions/306.html |
| **OWASP Top 10** | A01:2021 – Broken Access Control | https://owasp.org/Top10/A01_2021-Broken_Access_Control/ |
| **NIST CSF** | PR.AC-1 (Access Management) | Protect function |
| **CVSS v3.1** | **CRITICAL (9.8)** | AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H |

**Impact:** Unauthenticated attacker can subscribe to MCP event streams, access tool definitions, intercept sensitive data, or trigger RCE if MCP server exposes shell tools.

**Remediation:**
```python
@app.get("/sse")
def sse_handler(request: Request):
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return {"error": "Unauthorized"}, 401
    
    token = auth[7:]
    if not validate_token(token):
        return {"error": "Invalid token"}, 403
    
    return EventStream(...)
```

---

## Check 3: Message Endpoint Authentication

**Purpose:** Verify that POST /message requires Authorization header for MCP protocol messages.

| Framework | Classification | Reference |
|-----------|-----------------|-----------|
| **CWE** | CWE-306: Missing Authentication for Critical Function | https://cwe.mitre.org/data/definitions/306.html |
| **OWASP Top 10** | A01:2021 – Broken Access Control | https://owasp.org/Top10/A01_2021-Broken_Access_Control/ |
| **NIST CSF** | PR.AC-1 (Access Management) | Protect function |
| **CVSS v3.1** | **CRITICAL (9.8)** | AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H |

**Impact:** Unauthenticated attacker can call any MCP tool, execute commands, access data, or pivot laterally.

**Remediation:**
```python
@app.post("/message")
def message_handler(request: Request, body: dict):
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return {"jsonrpc": "2.0", "error": {"code": -32600, "message": "Unauthorized"}}, 401
    
    return handle_mcp_message(body)
```

---

## Check 4: MCP Endpoint Authentication

**Purpose:** Verify that POST /mcp requires Authorization header for HTTP MCP protocol transport.

| Framework | Classification | Reference |
|-----------|-----------------|-----------|
| **CWE** | CWE-306: Missing Authentication for Critical Function | https://cwe.mitre.org/data/definitions/306.html |
| **OWASP Top 10** | A01:2021 – Broken Access Control | https://owasp.org/Top10/A01_2021-Broken_Access_Control/ |
| **NIST CSF** | PR.AC-1 (Access Management) | Protect function |
| **CVSS v3.1** | **CRITICAL (9.8)** | AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H |

**Impact:** Unauthenticated tool execution, data access, lateral movement.

**Remediation:**
```python
@app.post("/mcp")
def mcp_handler(request: Request, body: dict):
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return {"error": "Unauthorized"}, 401
    
    return handle_http_mcp(body)
```

---

## Check 5: CORS Configuration

**Purpose:** Verify that Access-Control-Allow-Origin does not use wildcard (*).

| Framework | Classification | Reference |
|-----------|-----------------|-----------|
| **CWE** | CWE-942: Permissive Cross-domain Policy | https://cwe.mitre.org/data/definitions/942.html |
| **OWASP Top 10** | A01:2021 – Broken Access Control | https://owasp.org/Top10/A01_2021-Broken_Access_Control/ |
| **NIST CSF** | PR.AC-3 (Access Control) | Protect function |
| **CVSS v3.1** | **CRITICAL (9.8)** | AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:N |

**Impact:** Browser-based CSRF attacks, tool execution on victim's behalf.

**Remediation:**
```python
ALLOWED_ORIGINS = ["https://my-app.example.com"]

@app.middleware("http")
async def cors_middleware(request: Request, call_next):
    origin = request.headers.get("origin", "")
    
    if origin in ALLOWED_ORIGINS:
        response = await call_next(request)
        response.headers["Access-Control-Allow-Origin"] = origin
        return response
    
    return {"error": "CORS policy"}, 403
```

---

## Check 6: Authorization Header Validation

**Purpose:** Verify that invalid/fake Bearer tokens are rejected.

| Framework | Classification | Reference |
|-----------|-----------------|-----------|
| **CWE** | CWE-287: Improper Authentication | https://cwe.mitre.org/data/definitions/287.html |
| **OWASP Top 10** | A02:2021 – Cryptographic Failures | https://owasp.org/Top10/A02_2021-Cryptographic_Failures/ |
| **NIST CSF** | PR.AC-1 (Access Management) | Protect function |
| **CVSS v3.1** | **HIGH (7.5)** | AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N |

**Impact:** Token forgery, unauthorized access, impersonation.

**Remediation:**
```python
import jwt

def message_handler(request):
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return {"error": "Unauthorized"}, 401
    
    token = auth[7:]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        return {"result": tool_list}
    except jwt.InvalidTokenError:
        return {"error": "Invalid token"}, 403
```

---

## Summary Table

| Check | CWE | OWASP | NIST | Severity |
|-------|-----|-------|------|----------|
| Endpoint Reachability | N/A | N/A | ID.AM-1 | INFO |
| SSE Authentication | CWE-306 | A01:2021 | PR.AC-1 | **CRITICAL** |
| Message Authentication | CWE-306 | A01:2021 | PR.AC-1 | **CRITICAL** |
| MCP Authentication | CWE-306 | A01:2021 | PR.AC-1 | **CRITICAL** |
| CORS Configuration | CWE-942 | A01:2021 | PR.AC-3 | **CRITICAL** |
| Token Validation | CWE-287 | A02:2021 | PR.AC-1 | **HIGH** |

---

## References

- **CWE:** https://cwe.mitre.org/
- **OWASP Top 10 2021:** https://owasp.org/Top10/
- **NIST CSF:** https://www.nist.gov/cyberframework
- **CVSS v3.1:** https://www.first.org/cvss/calculator/3.1
