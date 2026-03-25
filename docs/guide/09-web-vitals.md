# Web Vitals Reference

| Metric | Good | Needs Improvement | Poor | Observer Type |
|--------|------|-------------------|------|---------------|
| LCP | ≤2.5s | ≤4.0s | >4.0s | `largest-contentful-paint` |
| INP | ≤200ms | ≤500ms | >500ms | `event` (durationThreshold: 40) |
| CLS | ≤0.1 | ≤0.25 | >0.25 | `layout-shift` |
| TTFB | ≤800ms | ≤1800ms | >1800ms | `navigation` |

> FID is **deprecated** as of March 2024. The SDK falls back to FID only if the `event` observer type is unsupported. File: `collectors/rum.js:42-48`.
