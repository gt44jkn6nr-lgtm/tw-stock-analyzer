# Technical Debt Report

Generated at: 2026-07-13T16:48:49.609Z

| ID | Severity | Title | Priority |
| --- | --- | --- | --- |
| TD-001 | high | server.mjs is becoming a platform bottleneck | 1 |
| TD-002 | high | Generated Master/Search JSON is committed as large artifacts | 2 |
| TD-003 | medium | Search ranking is deterministic but not yet relevance-trained | 3 |
| TD-004 | medium | Master Data update is manual | 4 |
| TD-005 | medium | Frontend is still a large imperative app file | 5 |

## Details

### TD-001 server.mjs is becoming a platform bottleneck

- Severity: high
- Reason: Routing, data fetching, scoring, financial modeling, timeline, search, and static serving are concentrated in one file.
- Impact: Feature velocity will drop and regression risk will rise as Supply Chain Intelligence and AI Search are added.
- Recommendation: Split into modules: routes, services, repositories, search, master-data, timeline, financial, and shared source metadata.
- Priority: 1

### TD-002 Generated Master/Search JSON is committed as large artifacts

- Severity: high
- Reason: Current search index is 7.68 MB; future announcements/news/supply-chain events will expand it quickly.
- Impact: Repository size, code review noise, deployment slug size, and merge conflicts will worsen.
- Recommendation: Move generated artifacts to build cache or object storage, keep source seeds and deterministic builder in git.
- Priority: 2

### TD-003 Search ranking is deterministic but not yet relevance-trained

- Severity: medium
- Reason: Weights are rule-based and do not yet use click feedback, user intent, or domain-specific synonym expansion.
- Impact: Long-tail searches may be correct but not ideal as topics, products, and news grow.
- Recommendation: Introduce query evaluation sets, click telemetry, and a versioned ranking profile before AI Search.
- Priority: 3

### TD-004 Master Data update is manual

- Severity: medium
- Reason: The builder supports incremental scope, but no scheduled job or stale alert exists yet.
- Impact: Listings, ETF changes, renamed companies, or delistings can become stale without operational discipline.
- Recommendation: Add scheduled refresh, diff report, source failure alerting, and approval gate for changed identifiers.
- Priority: 4

### TD-005 Frontend is still a large imperative app file

- Severity: medium
- Reason: Global Search was added into existing app.js, which already owns charts, timeline, financial UI, alerts, and watchlist.
- Impact: UI behavior will become hard to test and accessibility improvements will be slower.
- Recommendation: Modularize frontend by feature and introduce a small state/store layer before Portfolio and AI Chat.
- Priority: 5


## Four Platform Questions

1. Biggest technical debt: server.mjs and public/app.js are now too broad for a long-lived AI research platform.
2. Next best step: Stabilize Master Data in Preview, then extract Master/Search services before Phase 3 expands relation data.
3. Two-day refactor top three:
   - Extract server modules and route handlers.
   - Move generated search artifacts out of normal code review flow or add generated-file review policy.
   - Create shared source metadata and error contracts used by all APIs.
4. Better product design: Make Global Search the command center: query results should route into stocks, topics, products, events, and eventually AI answers, not only a topbar utility.
