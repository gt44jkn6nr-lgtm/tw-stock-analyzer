# ADR-003 Cache Strategy

## Status

Accepted for Phase 2.5 Preview.

## Problem

Master Data and Search Index should not be read from disk on every request. External data sources can also be slow or temporarily unavailable.

## Options

1. Read JSON files per request.
2. Load Master Data and Search Index into process memory.
3. Use Redis or another shared cache.

## Decision

Use process memory cache for Master Data and Search Index in Phase 2.5.

## Reasons

Render service instances are single-process for this app, and the index size is acceptable for the current memory budget. This minimizes latency and operational complexity.

## Pros

- Fast search responses after warmup.
- Simple implementation.
- No new infrastructure.
- Easy to expose cache metadata through `/api/master/status` and search metadata.

## Cons

- Cache is per process, not shared across instances.
- Refresh requires process reload or explicit future invalidation.
- Memory usage will grow when event search is added.

## Future Impact

If the platform introduces background refresh, multiple instances, or large event indexes, cache invalidation and shared cache strategy must be revisited. Redis or object-storage snapshots may become necessary.
