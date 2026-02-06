# CLAUDE.md

## Project Overview

AI-powered backend service for visual novel / game design content generation. Generates story dialogue, narration, and UI translations using multiple LLM providers (Claude, GPT, Gemini), storing results in Google Sheets for game development workflows.

## Tech Stack

- **Language:** TypeScript (strict mode)
- **Runtime:** Node.js 20
- **Framework:** Express.js 5.1
- **LLM Providers:** Anthropic SDK, OpenAI SDK, Google Generative AI SDK
- **Cloud:** Firebase Functions, Google Cloud Run
- **Data:** Google Sheets (primary store), Google Drive (asset management)
- **Templating:** Nunjucks (prompt templates)

## Directory Structure

```
server/
├── app.ts                  # Express app config & routing
├── index.ts                # Firebase function entry point
├── types.ts                # TypeScript interfaces & shared types
├── routes/
│   ├── aiStoryGenerator.ts # Story generation endpoints
│   ├── aiTranslate.ts      # Translation endpoint
│   └── googleDriveImageCopy.ts # Drive asset replication
├── services/
│   ├── ContextEngine.ts     # Context assembly engine (Provider pattern)
│   ├── contextProviders.ts  # Pluggable context providers
│   ├── PromptEngine.ts      # Backward-compatible ContextEngine wrapper
│   ├── storyOrchestrator.ts # Content generation orchestration
│   ├── llmRouter.ts         # Unified LLM routing (sendToLLM)
│   ├── outputParsers.ts     # Output parsing strategies (PSV, JSON)
│   ├── batchProcessor.ts    # Batch processing utilities
│   ├── anthropicAI.ts       # Claude API wrapper (+JSON mode)
│   ├── openAI.ts            # GPT API wrapper (+JSON mode)
│   ├── googleGemini.ts      # Gemini API wrapper (+JSON mode)
│   ├── googleSheet.ts       # Google Sheets read/write
│   └── googleDrive.ts       # Google Drive operations
└── prompts/                 # ~48 .txt prompt template files
shared/
└── helpUtil.ts              # Utility functions (loadPrompt, parseSheetToObject, writeLog)
```

## API Endpoints

- `POST /api/copy-images` — Copy images between Google Drive folders
- `POST /ai/batch-group-translate` — Batch translate content across languages
- `POST /ai-create/story-generate` — Generate single-line story dialogue
- `POST /ai-create/full-story-generate` — Generate full script (multiple lines)

## Build & Run

```bash
npm install          # Install dependencies
npm run dev          # Dev server with hot reload (ts-node-dev, port 8080)
npm run build        # Clean + compile TypeScript + copy prompt assets
npm start            # Run compiled output (dist/server/index.js)
```

Build pipeline: `clean` → `build:server` (tsc) → `copy` (copy-assets.js copies prompts/ to dist/)

## Environment Variables

Required in `.env`:
- `ANTHROPIC_API_KEY` — Claude API
- `OPENAI_API_KEY` — GPT API
- `GEMINI_API_KEY` — Gemini API
- `GOOGLE_SHARED_DRIVE_ID` — Google Drive shared drive
- Google Cloud service account credentials (JSON key file)

## Key Architecture Patterns

### Context Engineering (Provider Pattern)
- **ContextEngine** (`ContextEngine.ts`): Assembles prompts by collecting variables from registered `ContextProvider` instances
- **ContextProviders** (`contextProviders.ts`): Pluggable modules — `DictionaryProvider`, `CommonRowProvider`, `CharacterProfileProvider`, `ConversationHistoryProvider`, `FullScriptProfileProvider`
- **Extending context**: Create a new class implementing `ContextProvider` interface, register via `contextEngine.addProvider()` — zero modification to existing code

### LLM Abstraction
- **Unified router** (`llmRouter.ts`): Single `sendToLLM(request)` call routes to Claude/GPT/Gemini based on `model` field
- **JSON mode**: `sendToLLMJSON<T>(request)` for structured output — each provider has native JSON support (`sendToClaudeJSON`, `sendToOpenAIJSON`, `sendToGeminiJSON`)

### Prompt Templating
- **Nunjucks unified**: All templates use nunjucks for both `{{variable}}` substitution and `{% if %}` conditional blocks
- **Template files**: `.txt` files in `server/prompts/`, loaded via `loadPrompt()` from `shared/helpUtil.ts`

### Output Parsing
- **Text parsers** (`outputParsers.ts`): `parseSingleLineText()` (comma-split), `parseFullScriptPSV()` (pipe-split)
- **JSON parsers** (`outputParsers.ts`): `parseSingleLineJSON()`, `parseFullScriptJSON()` with automatic fallback to text parsers

### Other Patterns
- **Dual generation modes:** Single-line (update one row) vs full-script (generate entire scene)
- **Batch processing** (`batchProcessor.ts`): `processBatchesParallel()`, `processBatchesSequential()`, `chunkArray()`
- **Conversation history:** `StoryOrchestrator` maintains last N lines for narrative continuity
- **Atomic sheet updates:** All changes collected in memory, single `updateSheetData()` call

## Adding New Routes (Extension Guide)

```typescript
// 새 라우트 생성 5단계:
// 1. ContextEngine 생성 + 필요한 Provider 등록 (또는 PromptEngine 래퍼 사용)
// 2. sendToLLM() 또는 sendToLLMJSON() 으로 모델 호출
// 3. OutputParser 선택 (기존 파서 사용 또는 새 파서 작성)
// 4. processBatchesParallel() 로 배치 처리
// 5. googleSheet 서비스로 결과 저장
```

## Shared Types (server/types.ts)

- `GenerationMode` — `'single_line' | 'full_script'`
- `LLMModelName` — `'gpt' | 'claude' | 'gemini_pro' | 'gemini_flash'`
- `BaseStoryRow`, `StoryRowData`, `FullStoryRowData` — Row data interfaces
- `StoryResult` — Generation output format
- `OutputParser` — Parser strategy interface
- `OrchestratorConfig` — Orchestrator configuration

## Coding Conventions

- **PascalCase:** Classes, interfaces (`PromptEngine`, `BaseStoryRow`, `ContextProvider`)
- **camelCase:** Functions, variables
- **SCREAMING_SNAKE_CASE:** Constants (`BATCH_SIZE`, `MAX_HISTORY_LINES`)
- Comments written in Korean
- Console logs use emoji markers
- TypeScript strict mode with null coalescing (`??`) and optional chaining (`?.`)
- Path alias: `@shared/*` → `shared/*`

## Deployment

- **CI/CD:** GitHub Actions (`.github/workflows/deploy.yml`) auto-deploys to Google Cloud Run on push to `main`
- **Container:** Dockerfile based on Node.js 20

## Testing

No test framework is currently configured.
