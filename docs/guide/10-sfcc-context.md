# SFCC Context Reference

| Data Point | Source | Privacy Classification | Notes |
|---|---|---|---|
| `dwsid` | Cookie `dwsid` | Pseudonymous | Session ID, rotate on checkout. Include in error context only. |
| `visitorId` | Cookie `dwac_*`, field 0 | Sensitive | `__ANNONYMOUS__` means guest — treat as null |
| `customerId` | Cookie `dwac_*`, field 2 | Sensitive | `__ANNONYMOUS__` means guest — treat as null. Log only when essential. |
| `pageType` | URL path inference | Non-personal | Checkout, Cart, PDP, PLP, Search, Home, Other |
| `category` | `window.dw.ac._category` | Non-personal | Only on SiteGenesis, not PWA Kit |

**Rules for SFCC context extraction:**
- Never throw if `window.dw` is undefined
- Treat `__ANNONYMOUS__` as null, not a real value
- Cookie parsing must handle URI-encoded values
- `visitorId` and `customerId` must never appear in aggregate metrics
- `dwsid` and `dwac_*` cookie values must be listed as redaction targets in `Sanitizers`

### Commerce Action Detection (SCAPI Patterns)

The SDK detects successful commerce actions by matching SCAPI endpoints in `network.js`:

| Action | Method | Endpoint Pattern |
|---|---|---|
| `cart_add` | POST | `/baskets/{id}/items` |
| `cart_update` | PATCH | `/baskets/` |
| `cart_remove` | DELETE | `/baskets/{id}/items` |
| `checkout` | POST | `/orders` |
| `search` | GET | `/product-search` |

These fire as `COMMERCE_ACTION` events with the action name, sanitized endpoint, method, and `duration_ms` in metadata.
