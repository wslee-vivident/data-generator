# DAG 아키텍처 다이어그램 (v2 — Generic Core/Feature 분리)

## 1. 단순화 흐름도 (Human-Friendly)

전체 시스템의 실행 흐름을 직관적으로 표현한 다이어그램입니다.
Core 엔진은 도메인에 무관하며, Feature 레이어가 스토리 생성 로직을 주입합니다.

```mermaid
flowchart TD
    subgraph REQUEST["📥 HTTP Request"]
        R[POST /ai-create/story-generate]
    end

    subgraph ROUTE["🔷 라우트 ── aiStoryGenerator.ts"]
        direction TB
        VAL["입력 검증"]
        CTX["PipelineContext&lt;StoryInput&gt; 생성"]
        EXEC["graph.execute(ctx)"]
        RES["JSON 응답"]

        VAL --> CTX --> EXEC --> RES
    end

    subgraph ROUTE_DAG["🟢 라우트 레벨 DAG ── storyWorkflow.ts"]
        direction TB
        DP["FunctionalNode<br/>parseData"]
        PL["FunctionalNode<br/>loadMainTemplate"]
        SF["FunctionalNode<br/>fetchSheetData"]
        GR["FunctionalNode<br/>groupRows"]
        GEN["FunctionalNode<br/>generateForGroups"]
        MG["FunctionalNode<br/>mergeResults"]
        SU["FunctionalNode<br/>updateSheet"]

        DP --> GR
        PL --> GEN
        GR --> GEN
        GEN --> MG
        SF --> MG
        MG --> SU
    end

    subgraph LLM_DAG["🟠 행 레벨 LLM DAG ── storyWorkflow.ts (per row)"]
        direction TB
        CN["FunctionalNode<br/>contextCollector"]
        PN["FunctionalNode<br/>renderPrompt"]
        IB["FunctionalNode<br/>buildInputText"]
        LN["LLMNode<br/>buildLLMRequest"]
        PA["FunctionalNode<br/>parseOutput"]

        CN --> PN
        CN --> IB
        PN --> LN
        IB --> LN
        LN --> PA
    end

    subgraph INFRA["⚙️ 인프라 서비스"]
        CE["ContextEngine<br/>+ ContextProviders"]
        LA["ILLMAdapter<br/>→ llmRouter"]
        GS["Google Sheets API"]
        LLM_API["Claude / GPT / Gemini"]
    end

    R --> ROUTE
    EXEC -.-> ROUTE_DAG
    GEN -.->|그룹별 LLM 파이프라인 생성| LLM_DAG
    CN -.-> CE
    LN --> LA
    LA --> LLM_API
    SF -.-> GS
    SU -.-> GS

    style REQUEST fill:#e3f2fd,stroke:#1565c0
    style ROUTE fill:#e3f2fd,stroke:#1565c0
    style ROUTE_DAG fill:#e8f5e9,stroke:#2e7d32
    style LLM_DAG fill:#fff3e0,stroke:#e65100
    style INFRA fill:#f3e5f5,stroke:#6a1b9a
```

---

## 2. 파일 의존 관계 (import 방향)

화살표 방향 = import 방향 (A → B = "A가 B를 import").
Core 계층은 Feature/Infra에 의존하지 않으며, Feature가 Core를 조합합니다.

```mermaid
flowchart BT
    subgraph CORE["🟢 Core (도메인 무관 — 수정 불필요)"]
        subgraph types["📦 types.ts"]
            T["PipelineContext&lt;T&gt;, INode&lt;T&gt;,<br/>DAGNodeState&lt;T&gt;, DAGExecutionResult&lt;T&gt;,<br/>NodeStatus, GenerationMode,<br/>BaseStoryRow, StoryResult"]
        end

        subgraph graph["📦 dagGraph.ts"]
            DG["DAGGraph&lt;T&gt;<br/>.addNode() .validate() .execute()"]
        end

        subgraph stdNodes["📦 standardNodes.ts"]
            SN["FunctionalNode&lt;T&gt;<br/>LLMNode&lt;T&gt;"]
        end

        subgraph adapter["📦 llmAdapter.ts"]
            LA["ILLMAdapter (interface)<br/>DefaultLLMAdapter<br/>LoggingLLMAdapter"]
        end
    end

    subgraph FEATURE["🟠 Feature (스토리 도메인)"]
        subgraph tools["📦 storyTools.ts"]
            ST["StoryInput, StoryRowInput<br/>parseData, loadMainTemplate,<br/>groupRows, fetchSheetData,<br/>mergeResults, updateSheet,<br/>createContextCollector,<br/>renderPrompt, buildInputText,<br/>parseOutput, buildLLMRequest"]
        end

        subgraph workflow["📦 storyWorkflow.ts"]
            SW["buildStoryRouteGraph()<br/>buildStoryLLMGraph()<br/>generateForGroups()<br/>executeRowPipeline()"]
        end
    end

    subgraph ROUTE["🔷 Route"]
        subgraph route["📦 aiStoryGenerator.ts"]
            RT["handleStoryGeneration()"]
        end
    end

    subgraph INFRA["⚙️ Infra (기존 유지)"]
        subgraph providers["📦 contextProviders.ts"]
            CP["ContextProvider (interface)<br/>Dictionary / CommonRow /<br/>CharacterProfile /<br/>ConversationHistory /<br/>FullScriptProfile"]
        end

        subgraph engine["📦 ContextEngine.ts"]
            CE["ContextEngine<br/>.collectVariables()"]
        end

        subgraph router["📦 llmRouter.ts"]
            LR["sendToLLM() / sendToLLMJSON()<br/>LLMRequest / LLMResponse"]
        end

        subgraph parsers["📦 outputParsers.ts"]
            OP["parseSingleLineText()<br/>parseFullScriptPSV()<br/>parseSingleLineJSON()<br/>parseFullScriptJSON()"]
        end

        subgraph sheet["📦 googleSheet.ts"]
            GS["getSheetData()<br/>updateSheetData()"]
        end
    end

    %% Core 내부 의존
    graph --> types
    stdNodes --> types
    stdNodes --> adapter
    adapter --> router

    %% Feature 의존
    tools --> types
    tools --> engine
    tools --> providers
    tools --> parsers
    tools --> sheet
    tools --> router

    workflow --> types
    workflow --> graph
    workflow --> stdNodes
    workflow --> adapter
    workflow --> tools

    %% Route 의존
    route --> types
    route --> workflow

    %% Infra 내부 의존
    engine --> types
    engine --> providers
    providers --> types
    parsers --> types

    style CORE fill:#e8f5e9,stroke:#2e7d32
    style FEATURE fill:#fff3e0,stroke:#e65100
    style ROUTE fill:#e3f2fd,stroke:#1565c0
    style INFRA fill:#f3e5f5,stroke:#6a1b9a
```

---

## 3. 상세 클래스 관계도

실제 TypeScript 클래스의 구현(implements), 의존(uses), 장식(decorates) 관계를 표현합니다.

```mermaid
classDiagram
    direction TB

    %% ─── Core 클래스 ───
    class DAGGraph~T~ {
        -nodes: Map~string, DAGNodeState~
        +addNode(node: INode~T~, deps) this
        +validate() valid, error
        +execute(ctx: PipelineContext~T~) Promise~DAGExecutionResult~T~~
        +reset() void
        +getNodeIds() string[]
        +getNodeState(id) DAGNodeState~T~
        +size: number
    }

    class FunctionalNode~T~ {
        +id: string
        +name: string
        -action: (ctx) => Promise~void~
        +execute(ctx: PipelineContext~T~) Promise~void~
    }

    class LLMNode~T~ {
        +id: string
        +name: string
        -adapter: ILLMAdapter
        -buildPrompt: (ctx) => LLMRequest
        +execute(ctx: PipelineContext~T~) Promise~void~
    }

    class DefaultLLMAdapter {
        +send(request: LLMRequest) Promise~LLMResponse~
        +sendJSON~T~(request: LLMRequest) Promise~T~
    }

    class LoggingLLMAdapter {
        -inner: ILLMAdapter
        +send(request: LLMRequest) Promise~LLMResponse~
        +sendJSON~T~(request: LLMRequest) Promise~T~
    }

    %% ─── Feature 클래스 (내부 사용) ───
    class ContextEngine {
        -providers: ContextProvider[]
        -mainTemplate: string
        +addProvider(provider) this
        +collectVariables(row, history, mode) Record
        +buildPrompt(row, history, mode) string
    }

    class DictionaryProvider {
        -dictionaryText: string
    }
    class CommonRowProvider
    class CharacterProfileProvider {
        -resolveCharacterFile(speaker, level) string
    }
    class ConversationHistoryProvider {
        -singleLineMax: number
        -fullScriptMax: number
    }
    class FullScriptProfileProvider

    %% ─── implements 관계 ───
    INode~T~ <|.. FunctionalNode : implements
    INode~T~ <|.. LLMNode : implements
    ILLMAdapter <|.. DefaultLLMAdapter : implements
    ILLMAdapter <|.. LoggingLLMAdapter : implements
    ContextProvider <|.. DictionaryProvider : implements
    ContextProvider <|.. CommonRowProvider : implements
    ContextProvider <|.. CharacterProfileProvider : implements
    ContextProvider <|.. ConversationHistoryProvider : implements
    ContextProvider <|.. FullScriptProfileProvider : implements

    %% ─── 의존/사용 관계 ───
    DAGGraph --> INode : executes
    DAGGraph --> DAGNodeState : manages
    DAGGraph --> DAGExecutionResult : returns
    LLMNode --> ILLMAdapter : uses
    LoggingLLMAdapter o-- ILLMAdapter : decorates
    DefaultLLMAdapter --> llmRouter : delegates
    ContextEngine o-- ContextProvider : has many
    ContextEngine ..> nunjucks : renders
```

---

## 4. 상세 인터페이스 관계도

TypeScript 인터페이스와 타입 간의 참조/포함 관계를 표현합니다.
Core 인터페이스는 제네릭 `T`로 파라미터화되어 도메인에 무관합니다.

```mermaid
classDiagram
    direction TB

    %% ─── Core 인터페이스 (types.ts) ───
    class PipelineContext~T~ {
        <<interface>>
        +input: T  ── readonly
        +outputs: Record~string, any~
        +config: Record~string, any~
        +history: string[]
        +metadata: Record~string, any~
    }

    class INode~T~ {
        <<interface>>
        +id: string  ── readonly
        +name: string  ── readonly
        +execute(ctx: PipelineContext~T~) Promise~void~
    }

    class DAGNodeState~T~ {
        <<interface>>
        +node: INode~T~
        +status: NodeStatus
        +dependencies: string[]
        +error?: Error
        +startedAt?: number
        +completedAt?: number
    }

    class DAGExecutionResult~T~ {
        <<interface>>
        +success: boolean
        +context: PipelineContext~T~
        +nodeStates: Map~string, DAGNodeState~T~~
        +errors: Array~nodeId, error~
        +durationMs: number
    }

    class NodeStatus {
        <<type>>
        pending | running | completed | failed | skipped
    }

    %% ─── LLM 인터페이스 (llmAdapter.ts / llmRouter.ts) ───
    class ILLMAdapter {
        <<interface>>
        +send(request: LLMRequest) Promise~LLMResponse~
        +sendJSON~T~(request: LLMRequest) Promise~T~
    }

    class LLMRequest {
        <<interface>>
        +model: LLMModelName
        +inputText: string
        +systemPrompt: string
        +temperature?: number
    }

    class LLMResponse {
        <<interface>>
        +text: string
        +model: LLMModelName
    }

    %% ─── Feature 인터페이스 (storyTools.ts) ───
    class StoryInput {
        <<interface>>
        +mode: GenerationMode  ── readonly
        +sheetId: string  ── readonly
        +sheetName: string  ── readonly
        +promptFile: string  ── readonly
        +rawData: any[][]  ── readonly
        +dictionary: Record~string, string~  ── readonly
        +emotions?: string[]  ── readonly
    }

    class StoryRowInput {
        <<interface>>
        +row: BaseStoryRow  ── readonly
        +mode: GenerationMode  ── readonly
        +template: string  ── readonly
        +dictionary: Record~string, string~  ── readonly
    }

    %% ─── Context Provider 인터페이스 (contextProviders.ts) ───
    class ContextProvider {
        <<interface>>
        +canProvide(row, mode) boolean
        +provide(row, history) Record~string, string~
    }

    %% ─── 도메인 타입 (types.ts) ───
    class GenerationMode {
        <<type>>
        single_line | full_script
    }

    class LLMModelName {
        <<type>>
        gpt | claude | gemini_pro | gemini_flash
    }

    class BaseStoryRow {
        <<interface>>
        +sceneId: string
        +model?: string
        +temperature?: number
    }

    class StoryResult {
        <<interface>>
        +key: string
        +result: string
        +sceneId?: string
        +speaker?: string
        +emotion?: string
        +text?: string
    }

    %% ─── 참조 관계 ───
    INode --> PipelineContext : ctx 파라미터
    DAGNodeState --> INode : wraps
    DAGNodeState --> NodeStatus : status 타입
    DAGExecutionResult --> PipelineContext : contains
    DAGExecutionResult --> DAGNodeState : contains

    ILLMAdapter --> LLMRequest : 요청 타입
    ILLMAdapter --> LLMResponse : 응답 타입
    LLMRequest --> LLMModelName : model 필드

    StoryInput --> GenerationMode : mode 필드
    StoryRowInput --> GenerationMode : mode 필드
    StoryRowInput --> BaseStoryRow : row 필드

    PipelineContext ..> StoryInput : T = StoryInput (라우트)
    PipelineContext ..> StoryRowInput : T = StoryRowInput (LLM)
```
