# CLAUDE.md

## Project Overview

**App**: n8n Playground -- web UI + CLI for managing n8n workflow deployments
**Stack**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4
**Port**: 3001 (dev and prod)

## Build Commands

```bash
npm run dev      # Start dev server (http://localhost:3001)
npm run build    # Production build
npm run start    # Production server
npm run lint     # ESLint
```

## Architecture

### Frontend
- Dark-mode dev tool UI with sidebar navigation
- Pages: Dashboard, Workflows, Deploy, Promote, Backup, Test
- All pages are client components fetching from API routes

### API Layer
- `/api/status` (GET) -- workflow status from metadata.json
- `/api/workflows` (GET) -- list workflows from n8n instance
- `/api/deploy` (POST) -- deploy workflows to n8n
- `/api/promote` (POST) -- promote across environments
- `/api/backup` (POST) -- backup from n8n to local files
- `/api/activate` (POST) -- activate/deactivate workflows
- `/api/test` (POST) -- trigger webhook tests

### Service Layer (`n8n/services/`)
- JavaScript services wrapping existing n8n lib functions
- Return structured JSON (no console.log/process.exit)
- Imported by API routes via `require('@/n8n/services/...')`

### n8n Core (`n8n/`)
- `lib/` -- n8n API client, metadata registry, env remapping
- `config/` -- environment config (dev/staging/prod)
- `scripts/` -- CLI tools (also available via npm run n8n:*)
- `workflows/` -- JSON workflow definitions + metadata.json

## CLI Commands

```bash
npm run n8n:status                    # Status overview
npm run n8n:list                      # List all workflows
npm run n8n:deploy -- --env staging   # Deploy to staging
npm run n8n:promote -- case-study-creator dev stg  # Promote
npm run n8n:backup -- --env staging   # Backup from n8n
npm run n8n:activate -- case-study-creator dev     # Activate
npm run n8n:test                      # Test n8n connection
```

## Environment Variables (.env.local)

```
N8N_BASE_URL=https://workflows.ur-nl.com
N8N_API_KEY=<api-key>
N8N_WEBHOOK_BASE_URL=https://workflows.ur-nl.com/webhook  # optional
```

## Key Conventions

- Three environments: development -> staging -> production
- metadata.json is single source of truth for workflow IDs
- Sub-workflows promoted before main workflows
- Webhook paths: `/development/case-study-creator` format
