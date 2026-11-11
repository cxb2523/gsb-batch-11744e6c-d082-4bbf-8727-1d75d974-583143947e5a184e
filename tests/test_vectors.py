"""Test vectors for mcp-authscan"""

# Official MCP Registry API
OFFICIAL_REGISTRY = "https://registry.modelcontextprotocol.io"

# Known test servers (deliberately vulnerable)
TEST_VECTORS = {
    "vulnerable": [
        "http://localhost:3000/mcp",  # No auth required
        "http://localhost:3001/mcp",  # CORS wildcard
        "http://localhost:3002/mcp",  # Fake token accepted
    ],
    "secure": [
        "https://secure-server.example.com/mcp",  # Proper auth
    ],
    "edge_cases": [
        "http://server-with-invalid-cert/mcp",  # SSL/TLS issues
        "http://timeout-server/mcp",  # Timeout handling
        "http://server-returning-500/mcp",  # Error handling
    ]
}

# API endpoints to test
API_ENDPOINTS = {
    "sse": "/mcp/sse",
    "message": "/mcp/message",
    "tools": "/mcp/tools/list",
    "resources": "/mcp/resources/list",
}

# Authentication bypass patterns
AUTH_PATTERNS = {
    "no_header": {},
    "fake_bearer": {"Authorization": "Bearer fake_token_12345"},
    "malformed_bearer": {"Authorization": "Bearer"},
    "invalid_jwt": {"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.invalid"},
    "expired_jwt": {"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE2MDAwMDAwMDB9.invalid"},
    "empty_bearer": {"Authorization": "Bearer "},
    "basic_auth": {"Authorization": "Basic dXNlcjpwYXNz"},
    "custom_header": {"X-API-Key": "fake_key"},
}

# CORS misconfiguration patterns
CORS_PATTERNS = [
    ("Access-Control-Allow-Origin", "*"),
    ("Access-Control-Allow-Origin", "http://attacker.com"),
    ("Access-Control-Allow-Credentials", "true"),
    ("Access-Control-Allow-Methods", "*"),
]
