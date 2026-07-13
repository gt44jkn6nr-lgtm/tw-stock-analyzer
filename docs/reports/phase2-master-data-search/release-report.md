# Release Report

Generated at: 2026-07-13T16:03:49.677Z

## Version

- Release: Phase 2.5 Master Data + Global Search Preview Candidate
- Branch: phase2-master-data-search
- App version: 1.4.0-phase2-master-search-dev
- Master build version: phase2-master-data-search-1
- Checksum: 0e18a040929e0c041e662bc7cba9fd10e290910a7c2eace69e8493579c971335

## Features

- Master Data as shared company identity layer
- Global Search API and suggestions
- Search Index with exact, prefix, trie, and fuzzy maps
- Watchlist companyId migration
- Preview quality gates, ADRs, and reports

## Fixes

- Manual alias ranking now outranks less relevant exact-name matches where appropriate.
- Product prefix ranking is more stable for MOS/MOSFET queries.
- Global Search accessibility includes ARIA and keyboard behavior.

## Breaking Changes

None

## Migration

- Existing watchlist localStorage remains supported and is upgraded with companyId on load.
- Existing API consumers should continue using the standard success/data/error envelope.

## Known Issues

- Search history/recent endpoints are placeholders until account sync exists.
- Generated search artifacts are committed and should move to a better artifact strategy later.
- Natural-language search is keyword-index based, not AI reasoning yet.

## Rollback

Do not merge main if Preview fails. If already merged, redeploy production commit 316ab5e33e9f4719c6611e2f1043b231513e0867.

## Quality Summary

| Metric | Value |
| --- | --- |
| Data Quality | true |
| Search Accuracy | 220/220 |
| Master Data Size | 1.93 MB |
| Search Index Size | 7.68 MB |
