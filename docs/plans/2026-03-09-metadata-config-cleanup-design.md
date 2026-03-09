# Metadata & Config Cleanup

## Problem

Audit found 4 issues in metadata.json and environments.config.js:
- `used_by` lists on sub-workflows missing `pre-work-summary` and `session-slides`
- Unused `assetsApiUrl` in production config
- Document-summary-extractor dev/staging folders missing `folder_id`
- Parent workflow group folders missing `folder_id`

## Changes

### 1. Fix `used_by` lists (metadata.json)

Add `pre-work-summary` and `session-slides` to `used_by` on:
- llm-sub-workflow (dev + staging)
- drive-utils (dev + staging)

### 2. Remove `assetsApiUrl` (environments.config.js)

Remove `assetsApiUrl: 'https://assetsapi.jombay.com'` from production config. Not used.

### 3. Fix DSE folder IDs (metadata.json)

- document-summary-extractor dev: `Cj8Wfkq6WS7w1Gg9`
- document-summary-extractor staging: `c6ZI4UXcv20OKrHM`

### 4. Add parent folder IDs (metadata.json)

All workflow group folders (pre-work-summary, session-slides, case-study-creator, document-summary-extractor, project-memory-updater, llm-sub-workflow, drive-utils) get `folder_id: "4JLkQmhzFV2M76tX"`.

Note: Both instances currently share this ID (production was imported from dev_staging DB). These will diverge in future — tracked as a single value for now.

## Files

- `n8n/workflows/metadata.json`
- `n8n/config/environments.config.js`
