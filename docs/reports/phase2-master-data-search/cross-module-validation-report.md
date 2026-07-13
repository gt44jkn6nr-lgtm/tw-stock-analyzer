# Cross Module Validation Report

Generated at: 2026-07-13T17:04:18.805Z

| Check | Passed | Detail |
| --- | --- | --- |
| Financial validates stock through Master Data | true | /api/financial calls requireMasterStock before buildFinancialSummary |
| Timeline validates stock through Master Data | true | /api/timeline calls requireMasterStock before buildTimeline |
| Price and technical analysis validate stock through Master Data | true | /api/twse calls requireMasterStock before fetchStock |
| AI summary validates stock through Master Data | true | /api/ai-summary calls requireMasterStock before buildAiSummaryResponse |
| Search uses Search Index and Master Data warmup | true | /api/search loads Master Data and queries Search Index |
| Universe API returns Master Data instead of legacy stockUniverse | true | /api/universe responds with master.stocks |
| Watchlist stores companyId | true | watchlist normalization and add flow persist companyId |

Result: PASS

This is a static architecture gate. Preview validation must also verify live API behavior.
