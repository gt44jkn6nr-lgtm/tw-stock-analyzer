# ADR-005 API Convention

## Status

Accepted for Phase 2.5 Preview.

## Problem

The platform has multiple API families: stock price, financial, timeline, dashboard, master data, and search. Inconsistent response shapes make frontend behavior and automated validation fragile.

## Options

1. Let each endpoint return its own shape.
2. Standardize only errors.
3. Standardize success, error, source metadata, and timing metadata where relevant.

## Decision

Keep the existing standard envelope:

```json
{
  "success": true,
  "data": {},
  "error": null,
  "data_source": "...",
  "published_at": null,
  "fetched_at": "...",
  "reporting_period": null,
  "is_estimated": false,
  "confidence": 0.9,
  "source_url": null
}
```

Search endpoints additionally return `data.metadata`, including `searchTimeMs`, `matchedCount`, `exactCount`, `fuzzyCount`, and `cacheHit`.

## Reasons

The platform needs trust, source traceability, and graceful degradation. A common API envelope is a product feature, not just backend style.

## Pros

- Easier frontend error handling.
- Consistent source disclosure.
- Better automated testing.
- Prepares for AI answers that cite website data and dates.

## Cons

- Some endpoints duplicate metadata in envelope and nested payload.
- Legacy code still has inconsistent internal data shapes.
- More discipline is required when adding routes.

## Future Impact

Before Phase 3 grows event and relationship APIs, the response envelope should be documented in OpenAPI or a lightweight schema file. Long term, all API contracts should be validated in tests.
