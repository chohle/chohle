# AI assistant (optional)

An in-app chat assistant that can **read** your data and **draft** new customers
and invoices from plain language ("add Müller Bau as a customer and bill them 8h
consulting at 150"). It runs against a **local LLM you host yourself**, so no
data leaves your server.

It is **off by default**. Turn it on only if you want it.

## What it can and cannot do

- **Read**: list/search customers, invoices and articles, and a small overview.
- **Create, with your approval**: customers and invoices (drafts). Every create
  is shown as a card in the chat with **Approve / Cancel** — nothing is written
  until you approve.
- **It can never edit or delete anything.** There is no update or delete tool in
  the registry, so destructive actions are impossible by construction, not just
  discouraged. The only write path re-validates everything and only inserts.

Created invoices are **drafts with no number** (same as the normal flow); you
assign the number later on the invoices page. Because an invoice needs a project,
the assistant attaches it to an existing project or creates a simple sales
project for the customer.

## Enabling it

The assistant speaks the **OpenAI-compatible** chat protocol, so you can use the
bundled Ollama or point it at any other endpoint.

### Option A: the bundled Ollama (Docker)

```bash
# Dev
docker compose --profile llm up
docker compose exec ollama ollama pull qwen2.5:7b

# Production
docker compose -f docker-compose.prod.yml --profile llm up -d
docker compose -f docker-compose.prod.yml exec ollama ollama pull qwen2.5:7b
```

Then set in `.env` and restart the app:

```env
CHOHLE_ASSISTANT=true
NUXT_LLM_BASE_URL=http://ollama:11434/v1
NUXT_LLM_MODEL=qwen2.5:7b
```

The `ollama` service only starts with `--profile llm`, so a normal
`docker compose up` ignores it entirely.

### Option B: an external endpoint

Point `NUXT_LLM_BASE_URL` at LM Studio, llama.cpp's server, vLLM, or a hosted
OpenAI-compatible API. Set `NUXT_LLM_API_KEY` if it needs one. No Docker profile
needed.

## Configuration

| Variable            | Default                  | Purpose                                                   |
| ------------------- | ------------------------ | --------------------------------------------------------- |
| `CHOHLE_ASSISTANT`  | _(unset)_                | `true` enables the assistant and shows it in the sidebar. |
| `NUXT_LLM_BASE_URL` | `http://ollama:11434/v1` | OpenAI-compatible base URL of the model server.           |
| `NUXT_LLM_MODEL`    | `qwen2.5:7b`             | Model name to request.                                    |
| `NUXT_LLM_API_KEY`  | _(empty)_                | Bearer token, only for hosted endpoints that require one. |

## Choosing a model

The model must support **tool/function calling**, or it can chat but won't create
records reliably. Known-good local models:

- **qwen2.5:7b** (default) — good tool calling, ~8 GB RAM.
- **llama3.1:8b** / **llama3.2** — also solid.
- **mistral** — works.
- Small box (≤ 4 GB RAM): try a **3B** model (e.g. `qwen2.5:3b`) — faster but
  flakier at multi-step requests — or point at an external endpoint instead.

**Hardware note:** an 8B model needs roughly 8 GB of free RAM and is CPU-bound
(seconds to tens of seconds per reply) without a GPU. The public demo box is too
small; keep the assistant off there.

## Safety model

- **Propose → approve → commit.** The model can only call `propose_*` tools,
  which validate and preview; they never write. Writes happen only after you
  click Approve, through a single endpoint that re-validates and runs one atomic
  transaction.
- **No delete/update tools exist**, so the assistant cannot alter or remove data.
- **Disabled in demo mode** and blocked for demo visitors.
- **Audited**: every committed batch is recorded in the `assistant_audit` table.

## How it works (internals)

| File                                  | Role                                                                |
| ------------------------------------- | ------------------------------------------------------------------- |
| `server/utils/assistant/llm.ts`       | OpenAI-compatible client + system prompt.                           |
| `server/utils/assistant/tools.ts`     | Tool registry: read tools + propose-only write tools.               |
| `server/utils/assistant/commit.ts`    | `commitActions(db, actions)` — the atomic, re-validated write path. |
| `server/api/assistant/chat.post.ts`   | Runs the tool-calling loop; returns proposals.                      |
| `server/api/assistant/commit.post.ts` | Executes approved actions; writes the audit row.                    |
| `server/api/assistant/status.get.ts`  | Whether the assistant is enabled.                                   |
| `app/pages/assistant.vue`             | The chat page with approval cards.                                  |

Reuses the same `parseCustomer` / `computeInvoiceTotals` logic as the normal
endpoints, so assistant-created records are identical to hand-entered ones.
