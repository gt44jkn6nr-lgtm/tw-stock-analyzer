# API Consistency Report

Generated at: 2026-07-13T16:16:09.820Z

## Expected Envelope

- success
- data
- error
- data_source
- published_at
- fetched_at
- reporting_period
- is_estimated
- confidence
- source_url

## Endpoint Checks

| Endpoint | Passed | Detail |
| --- | --- | --- |
| /api/health | true | Route uses sendSuccess envelope; errors flow through sendError/classifyError. |
| /api/version | true | Route uses sendSuccess envelope; errors flow through sendError/classifyError. |
| /api/master/status | true | Route uses sendSuccess envelope; errors flow through sendError/classifyError. |
| /api/master | true | Route uses sendSuccess envelope; errors flow through sendError/classifyError. |
| /api/search | true | Route uses sendSuccess envelope; errors flow through sendError/classifyError. |
| /api/search/suggestions | true | Route uses sendSuccess envelope; errors flow through sendError/classifyError. |
| /api/search/history | true | Route uses sendSuccess envelope; errors flow through sendError/classifyError. |
| /api/search/popular | true | Route uses sendSuccess envelope; errors flow through sendError/classifyError. |
| /api/search/recent | true | Route uses sendSuccess envelope; errors flow through sendError/classifyError. |
| /api/universe | true | Route uses sendSuccess envelope; errors flow through sendError/classifyError. |
| /api/twse | true | Route uses sendSuccess envelope; errors flow through sendError/classifyError. |
| /api/ai-summary | true | Route uses sendSuccess envelope; errors flow through sendError/classifyError. |
| /api/financial | true | Route uses sendSuccess envelope; errors flow through sendError/classifyError. |
| /api/timeline | true | Route uses sendSuccess envelope; errors flow through sendError/classifyError. |
| /api/timeline/sources | true | Route uses sendSuccess envelope; errors flow through sendError/classifyError. |
| /api/dashboard | true | Route uses sendSuccess envelope; errors flow through sendError/classifyError. |
| /api/revenue-radar | true | Route uses sendSuccess envelope; errors flow through sendError/classifyError. |
| /api/industry-quotes | true | Route uses sendSuccess envelope; errors flow through sendError/classifyError. |

## Metadata Checks

| Check | Passed |
| --- | --- |
| sendSuccess emits success/data/error | true |
| sendError emits success/data/error | true |
| responseMeta includes source metadata | true |
| search metadata includes timing and cache fields | true |

Result: PASS

Preview validation must replace this static gate with live response samples for all endpoints.
