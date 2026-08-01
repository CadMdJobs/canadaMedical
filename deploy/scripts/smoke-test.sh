#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# smoke-test.sh — Post-deploy smoke tests
#
# Validates that all critical endpoints are reachable and returning expected
# status codes. Runs automatically after each deploy in CI/CD.
#
# Usage:
#   ./smoke-test.sh --base https://api.yourdomain.com
#   ./smoke-test.sh --base http://localhost:8000   (local dev)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

BASE_URL=""
TIMEOUT=10
FAILED=0
PASSED=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base) BASE_URL="${2%/}"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

[[ -z "$BASE_URL" ]] && { echo "ERROR: --base <url> is required"; exit 1; }

# ── Colour output ─────────────────────────────────────────────────────────────
green() { printf '\033[0;32m✓ %s\033[0m\n' "$*"; }
red()   { printf '\033[0;31m✗ %s\033[0m\n' "$*"; }

check() {
  local description="$1"
  local url="$2"
  local expected_status="${3:-200}"
  local method="${4:-GET}"
  local body="${5:-}"

  local actual
  if [[ "$method" == "POST" && -n "$body" ]]; then
    actual=$(curl -s -o /dev/null -w "%{http_code}" \
      -X POST \
      -H "Content-Type: application/json" \
      -d "$body" \
      --max-time "$TIMEOUT" \
      "$url" 2>/dev/null || echo "000")
  else
    actual=$(curl -s -o /dev/null -w "%{http_code}" \
      --max-time "$TIMEOUT" \
      "$url" 2>/dev/null || echo "000")
  fi

  if [[ "$actual" == "$expected_status" ]]; then
    green "$description (HTTP $actual)"
    PASSED=$((PASSED + 1))
  else
    red "$description (expected HTTP $expected_status, got HTTP $actual) — $url"
    FAILED=$((FAILED + 1))
  fi
}

echo ""
echo "=== Smoke Tests: $BASE_URL ==="
echo ""

# ── Infrastructure ────────────────────────────────────────────────────────────
check "Health endpoint"                  "$BASE_URL/api/health/"                200
check "OpenAPI schema accessible"        "$BASE_URL/api/schema/"                200

# ── Public API endpoints ──────────────────────────────────────────────────────
check "Jobs list (public)"               "$BASE_URL/api/v1/jobs/"               200
check "Specialties list (public)"        "$BASE_URL/api/v1/jobs/specialties/"   200
check "Provinces list (public)"          "$BASE_URL/api/v1/jobs/provinces/"     200
check "Platform stats (public)"          "$BASE_URL/api/v1/stats/"              200
check "FAQs list (public)"               "$BASE_URL/api/v1/faq/"                200
check "Testimonials list (public)"       "$BASE_URL/api/v1/testimonials/"       200
check "Featured recruiters (public)"     "$BASE_URL/api/v1/jobs/featured-recruiters/" 200

# ── Auth gates ────────────────────────────────────────────────────────────────
check "Protected endpoint rejects anon" "$BASE_URL/api/v1/auth/me/"             401
check "Admin API rejects anon"           "$BASE_URL/api/v1/admin/dashboard/"    401

# ── Auth flow ─────────────────────────────────────────────────────────────────
check "Login with bad creds returns 401" \
  "$BASE_URL/api/v1/auth/login/" \
  401 POST '{"email":"nobody@nowhere.com","password":"wrong"}'

# ── Error handling ────────────────────────────────────────────────────────────
check "Non-existent job returns 404"    "$BASE_URL/api/v1/jobs/999999/"          404
check "Unknown route returns 404"       "$BASE_URL/api/v1/this-does-not-exist/"  404

# ── Admin route obfuscation ───────────────────────────────────────────────────
# /admin/ should redirect to login (302) not be fully open
check "Django admin not open to public" "$BASE_URL/admin/"                       302

echo ""
echo "──────────────────────────────────────────"
echo "  Passed: $PASSED"
echo "  Failed: $FAILED"
echo "──────────────────────────────────────────"
echo ""

if [[ "$FAILED" -gt 0 ]]; then
  echo "SMOKE TESTS FAILED — check deployment logs"
  exit 1
fi

echo "All smoke tests passed."
exit 0
