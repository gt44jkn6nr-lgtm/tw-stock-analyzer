# ADR-004 Alias Strategy

## Status

Accepted for Phase 2.5 Preview.

## Problem

Users search by abbreviations, common names, English tickers, product terms, and informal aliases. Treating all aliases as equal would create ranking errors and trust issues.

## Options

1. Store aliases as plain strings.
2. Store aliases with source and confidence.
3. Infer aliases dynamically from news and user queries.

## Decision

Store aliases as structured objects:

```json
{
  "alias": "TSMC",
  "source": "manual_alias",
  "confidence": 1
}
```

## Reasons

Source and confidence let the UI and ranking layer distinguish official names, manual aliases, source-derived aliases, and future model-derived aliases.

## Pros

- More explainable search results.
- Supports future trust scoring.
- Avoids treating rumors or model-derived terms as official data.
- Fits the platform principle of separating source facts from model interpretation.

## Cons

- More verbose data model.
- Requires data quality checks for duplicates.
- Manual aliases need maintenance.

## Future Impact

As AI Search learns from user behavior and news sources, aliases should remain versioned and source-labeled. Model-suggested aliases must not be promoted to official aliases without review.
