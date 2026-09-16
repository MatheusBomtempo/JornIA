# JornAI

JornAI is a web tool that lets a newsroom publish breaking-news posts to Instagram fast, with AI writing the copy and a human always reviewing before anything goes live.

## How it works

```
Source (photo, text, link, or PDF)
        │
        ▼
AI writes the copy (title, subtitle, caption)
        │
        ▼
Reporter adjusts photo + text in a fixed template
        │
        ▼
Editor reviews → approve / reject / regenerate / edit
        │
        ▼
Publish to Instagram
```

- **AI only writes text** — it never generates or picks images. Photos are always real and chosen by a person.
- Every AI generation (or manual edit) creates a **new version**, so nothing is overwritten and there's a full history.
- Nothing reaches Instagram without a human approving it first.

## Why

Newsrooms often need to get a short, urgent post out (an accident, a weather alert, a local event) with almost no friction, but still with editorial review and consistent branding — not a generic social-media scheduler, and not a raw AI text generator with no guardrails.

## Fact-accuracy pipeline

Feeding a police report or an official PDF straight into an LLM is a good way to get a confident-sounding article with wrong facts. JornAI's pipeline is built around not letting that happen:

- Source text is cleaned and compacted deterministically (no AI) before it ever reaches a model — official documents/forms get their real fields extracted (who, where, cause, injuries) instead of being blindly truncated.
- Personal data (names, CPF, phone numbers, plates) is redacted before the AI ever sees it.
- The system prompt has explicit, tested rules against inventing details, generic filler, or unsupported claims.
- Generated content is checked against the source by a deterministic validator after generation (e.g. weekday must match the source date, no unsupported claims about investigations/road closures/deaths); a violation triggers one corrective regeneration before failing loudly.

## Tech stack

- **Next.js** (App Router) + **TypeScript**, **PostgreSQL** via **Prisma**
- **Fabric.js** for the in-browser art editor, **Sharp** for server-side final render
- AI: any OpenAI-compatible or Anthropic-compatible text provider (OpenRouter, Groq, Gemini, OpenAI, Claude), with automatic fallback across providers
- Instagram Graph API for publishing

## Roles

| Role | Can do |
|---|---|
| **admin** | Everything — users, API keys, templates, style examples, approve/publish |
| **manager** | Approve/reject/regenerate/edit/publish; manage templates and style examples |
| **staff** (reporter) | Submit sources, edit own drafts before approval |

## Getting started

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL and an AI provider key
npm run db:migrate
npm run db:seed
npm run dev
```

No AI key yet? Set `AI_PROVIDER="mock"` in `.env` to run the whole flow with a stub AI response — useful for trying the app without any external service.

See [`SPEC.md`](SPEC.md) (in Portuguese) for the full technical spec: database schema, API endpoints, and state machine.

## License

MIT — see [`LICENSE`](LICENSE).
