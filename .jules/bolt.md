## 2026-03-18 - Optimize sanitizeStack
**Learning:** The sanitizeStack function was creating intermediate arrays and strings by splitting and joining the entire stack trace string: let cleaned = v.split('\n').slice(0, 15).join('\n');. This created unnecessary memory allocation and performance overhead.
**Action:** Replaced array allocation parsing with string manipulation logic to improve performance and reduce overhead. Used indexOf to find the 15th newline and substring to get the string up to that point. Also chained regex replace methods.
