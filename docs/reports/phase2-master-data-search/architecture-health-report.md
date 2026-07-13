# Architecture Health Report

Generated at: 2026-07-13T16:51:21.236Z

| Area | Summary |
| --- | --- |
| Biggest architecture strength | Master Data now provides a shared identity layer for stock, ETF, product, topic, and source-company search. |
| Biggest technical debt | server.mjs and public/app.js are now too broad for a long-lived AI research platform. |
| Biggest risk | The generated local JSON index is acceptable now, but event/news/supply-chain indexing can outgrow process memory and repository review flow. |
| Next best direction | Build Preview with live quality metrics, then split Master/Search into services before starting Supply Chain Intelligence. |

## Health Signals

| Signal | Value |
| --- | --- |
| Cross-module Master Data | true |
| API consistency | true |
| Search accuracy | true |
| Master Data size | 1.93 MB |
| Search Index size | 7.68 MB |
| Avg search time | 0.5423 ms |
