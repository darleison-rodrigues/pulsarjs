# Sanitizers Contract

`Sanitizers.redactPII(str: string): string` must handle at minimum:

- Credit card numbers (Luhn-detectable patterns)
- Email addresses
- US/CA phone numbers
- IPv4 addresses in query strings
- `password=`, `token=`, `api_key=`, `apikey=`, `authorization=` key-value patterns (case-insensitive)
- JWT tokens (`eyJ...` patterns)
- `dwsid=` and `dwac_` cookie/query string patterns
- Raw WebGL renderer strings matching GPU model patterns (classify, do not pass through)
- Precise timestamps in error context — bucket to nearest minute

`Sanitizers.sanitizeUrl(url)` — strips query params and fragments.
`Sanitizers.sanitizeApiEndpoint(url)` — replaces dynamic path segments (IDs) with `{id}`.

Return value must always be a string. Never throw. Input of non-string type should return `'[redacted]'`.
