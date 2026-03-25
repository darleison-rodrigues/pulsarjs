# Device Signal Strategy

WebGL and device capability signals are useful for correlating performance issues with hardware tier. The following rules define what is and is not permitted.

**Permitted:**
- Broad cohort classification using WebGL — `high-gpu`, `mid-gpu`, `low-gpu`, `software-render`, `apple-silicon`
- Each cohort must represent a population of at least tens of thousands of users to avoid quasi-identification
- `navigator.hardwareConcurrency` and `deviceMemory` for capability hints
- `navigator.connection.effectiveType` for network tier

**Not permitted:**
- Raw GPU renderer strings (e.g., `"ANGLE (NVIDIA GeForce RTX 3090)"`) stored at event level
- Full WebGL extension lists
- Hashed combinations of GPU parameters — a hash of identifying data is still identifying data
- Any signal combination that could single out an individual device

```js
// Correct — cohort label only
function getDeviceCohort() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl');
  if (!gl) return 'no-webgl';
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);

  if (/Apple M[123]/i.test(renderer)) return 'apple-silicon';
  if (/RTX [34]\d{3}/i.test(renderer)) return 'high-nvidia';
  if (/SwiftShader|llvmpipe/i.test(renderer)) return 'software-render';
  if (maxTex >= 16384) return 'high-gpu';
  if (maxTex >= 8192) return 'mid-gpu';
  return 'low-gpu';
}

// Wrong — raw string stored or transmitted
const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL); // never send this
```

`software-render` (SwiftShader / llvmpipe) is also a useful **bot detection signal** — log it as a risk indicator at the transaction level, not as a persistent device profile.
