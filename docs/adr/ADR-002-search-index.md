# ADR-002 Search Index

## Status

Accepted for Phase 2.5 Preview.

## Problem

Global Search needs to support stock codes, Chinese names, English names, aliases, ETFs, products, topics, industries, and future event records without scanning all Master Data on every request.

## Options

1. Linear scan of Master Data on every query.
2. Local JSON index with exact, prefix, trie, and fuzzy maps.
3. External search service such as Meilisearch, Typesense, or Elasticsearch.

## Decision

Use a local generated `data/search-index.json` with:

- `exactMap`
- `prefixIndex`
- `trieIndex`
- `fuzzyIndex`
- `documents`

## Reasons

The current data size is small enough for memory-resident search, but the index gives us a proper seam for future replacement by a search service.

## Pros

- Very fast local lookup.
- No new service dependency.
- Deterministic search behavior.
- Can be tested with fixed accuracy cases.

## Cons

- Ranking is rule-based, not learned.
- Index file will grow when announcements, news, and supply-chain events are added.
- Trie is currently generated for prefix capability but not yet fully exploited by the runtime.

## Future Impact

Before AI Search and Knowledge Graph expansion, we should decide whether to keep this local index or move to a dedicated search service. The API should remain stable so the backend implementation can change without breaking the UI.
