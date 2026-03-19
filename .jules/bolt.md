## BOLT JOURNAL

## 2024-05-15 - [String Allocation Optimization in Sanitizers]
**Learning:** Using `.split('\n').slice(0, 15).join('\n')` for limiting a stack trace to 15 lines is extremely costly because it allocates strings for every single line in the error trace, plus a new array, before throwing them away. Manual index searching via `indexOf` avoids these allocations and is around 3-6x faster for this specific operation.
**Action:** Always prefer manual character searches (`indexOf`, `lastIndexOf`) over `.split()` and array manipulation when simply trying to extract a substring based on character occurrences.
