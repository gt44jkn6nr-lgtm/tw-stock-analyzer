# ADR-001 Master Data

## Status

Accepted for Phase 2.5 Preview.

## Problem

The platform previously resolved companies from several local lists and feature-specific fallbacks. That creates inconsistent company names, market classification, ETF handling, and future supply-chain mappings.

## Options

1. Keep feature-specific lists.
2. Use JSON Master Data committed with the application.
3. Move Master Data to a database immediately.

## Decision

Use JSON Master Data as the first Single Source of Truth:

- `data/master-stock.json`
- `data/master-version.json`
- `data/master-topic.json`
- `data/master-product.json`
- `data/master-company.json`

Every listed entity uses a stable `companyId`, such as `TWSE-2330` or `TPEx-5425`.

## Reasons

JSON is simple, deterministic, reviewable, and works within the current Render deployment model. It gives us a stable platform layer before introducing database operations.

## Pros

- Low operational complexity.
- Easy to diff and validate.
- Works without a new infrastructure dependency.
- Good enough for listed stocks, TPEx stocks, and listed ETFs.

## Cons

- Large generated files add repository noise.
- Updates are manual until scheduled refresh exists.
- Not ideal for high-frequency event data or user-specific data.

## Future Impact

Supply Chain, Timeline, AI Search, Watchlist, and Portfolio should reference `companyId` instead of raw `stockNo`. When the platform grows, this layer should move to a managed database or object storage with versioned snapshots.
