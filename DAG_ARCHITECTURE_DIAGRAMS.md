# DAG 아키텍처 다이어그램

## 1. 단순화 흐름도 (Human-Friendly)

파일 간 의존 관계와 실행 흐름을 직관적으로 표현한 다이어그램입니다.

### 1-1. 전체 시스템 흐름

```mermaid
flowchart TD
    subgraph REQUEST["📥 HTTP Request"]
        R[POST /ai-create/story-generate]
    end

    subgraph ROUTE_DAG["🔷 라우트 레벨 DAG ── aiStoryGenerator.ts"]
        direction TB
        DP[DataParseNode<br/>데이터 파싱]
        PL[PromptLoadNode<br/>프롬프트 로드]
        SF[SheetFetchNode<br/>시트 조회]
        GR[GroupingNode<br/>Scene 그룹핑]
        GEN[GenerationNode<br/>LLM 생성]
        MG[MergeNode<br/>결과 병합]
        SU[SheetUpdateNode<br/>시트 저장]

        DP --> GR
        PL --> GEN
        GR --> GEN
        GEN --> MG
        SF --> MG
        MG --> SU
    end

    subgraph INNER_DAG["🔶 LLM 파이프라인 DAG ── dagOrchestrator.ts (per row)"]
        direction TB
        CN[ContextNode<br/>변수 수집]
        PN[PromptNode<br/>템플릿 렌더링]
        IB[InputBuildNode<br/>입력 텍스트 빌드]
        LN[LLMNode<br/>AI 모델 호출]
        PA[ParseNode<br/>출력 파싱]

        CN --> PN
        CN --> IB
        PN --> LN
        IB --> LN
        LN --> PA
    end

    subgraph INFRA["⚙️ 인프라 서비스"]
        CE[ContextEngine<br/>+ ContextProviders]
        LA[LLMAdapter<br/>→ llmRouter]
        RA[ResultAggregator]
        GS[Google Sheets API]
        LLM_API["Claude / GPT / Gemini"]
    end

    R --> ROUTE_DAG
    GEN -.->|그룹별 DAGOrchestrator 생성| INNER_DAG
    CN --> CE
    LN --> LA
    LA --> LLM_API
    PA --> RA
    SF --> GS
    SU --> GS

    style REQUEST fill:#e3f2fd,stroke:#1565c0
    style ROUTE_DAG fill:#e8f5e9,stroke:#2e7d32
    style INNER_DAG fill:#fff3e0,stroke:#e65100
    style INFRA fill:#f3e5f5,stroke:#6a1b9a
```

### 1-2. 파일 의존 관계 (import 방향)

```mermaid
flowchart BT
    subgraph types["📦 server/types.ts"]
        T["GenerationMode, BaseStoryRow,<br/>StoryResult, PipelineContext,<br/>IPipelineNode, DAGNodeState"]
    end

    subgraph providers["📦 contextProviders.ts"]
        CP["ContextProvider (interface)<br/>Dictionary / CommonRow /<br/>CharacterProfile / ConversationHistory /<br/>FullScriptProfile"]
    end

    subgraph engine["📦 ContextEngine.ts"]
        CE["ContextEngine<br/>.collectVariables()<br/>.buildPrompt()"]
    end

    subgraph router["📦 llmRouter.ts"]
        LR["sendToLLM()<br/>sendToLLMJSON()<br/>LLMRequest / LLMResponse"]
    end

    subgraph parsers["📦 outputParsers.ts"]
        OP["parseSingleLineText()<br/>parseFullScriptPSV()<br/>parseSingleLineJSON()<br/>parseFullScriptJSON()"]
    end

    subgraph adapter["📦 llmAdapter.ts"]
        LA["ILLMAdapter (interface)<br/>DefaultLLMAdapter<br/>LoggingLLMAdapter"]
    end

    subgraph aggregator["📦 resultAggregator.ts"]
        RA["IResultAggregator (interface)<br/>ResultAggregator<br/>DeduplicatingAggregator"]
    end

    subgraph graph["📦 dagGraph.ts"]
        DG["DAGGraph&lt;TCtx&gt;<br/>.addNode() .execute()"]
    end

    subgraph nodes["📦 dagPipelineNodes.ts"]
        PN["ContextNode / PromptNode /<br/>InputBuildNode / LLMNode / ParseNode"]
    end

    subgraph orch["📦 dagOrchestrator.ts"]
        DO["DAGOrchestrator<br/>.generateAll()"]
    end

    subgraph routeNodes["📦 dagStoryRouteNodes.ts"]
        RN["StoryRouteContext<br/>DataParseNode / PromptLoadNode /<br/>GroupingNode / GenerationNode /<br/>SheetFetchNode / MergeNode / SheetUpdateNode"]
    end

    subgraph route["📦 aiStoryGenerator.ts"]
        RT["buildStoryDAG()<br/>handleStoryGeneration()"]
    end

    subgraph sheet["📦 googleSheet.ts"]
        GS["getSheetData()<br/>updateSheetData()"]
    end

    providers --> types
    engine --> types
    engine --> providers
    router --> types
    parsers --> types
    adapter --> router
    aggregator --> types
    graph --> types
    nodes --> types
    nodes --> engine
    nodes --> adapter
    nodes --> parsers
    orch --> types
    orch --> engine
    orch --> providers
    orch --> graph
    orch --> adapter
    orch --> aggregator
    orch --> nodes
    routeNodes --> types
    routeNodes --> orch
    routeNodes --> sheet
    route --> types
    route --> graph
    route --> routeNodes

    style types fill:#fff9c4,stroke:#f57f17
    style graph fill:#e8f5e9,stroke:#2e7d32
    style orch fill:#e8f5e9,stroke:#2e7d32
    style route fill:#e3f2fd,stroke:#1565c0
    style routeNodes fill:#e3f2fd,stroke:#1565c0
```

---

## 2. 클래스 · 인터페이스 상관 관계도 (Detailed)

실제 TypeScript 클래스/인터페이스의 구현(implements), 의존(uses), 포함(has) 관계를 표현합니다.

### 2-1. DAG 코어 + LLM 파이프라인 노드

```mermaid
classDiagram
    direction TB

    class IPipelineNode~TCtx~ {
        <<interface>>
        +id: string
        +name: string
        +execute(ctx: TCtx) Promise~void~
    }

    class PipelineContext {
        <<interface>>
        +row: BaseStoryRow
        +mode: GenerationMode
        +template: string
        +dictionary: Record~string, string~
        +history: string[]
        +templateVars: Record~string, string~
        +systemPrompt: string
        +inputText: string
        +llmRawOutput: string
        +results: StoryResult[]
        +metadata: Record~string, any~
    }

    class DAGNodeState~TCtx~ {
        <<interface>>
        +node: IPipelineNode~TCtx~
        +status: NodeStatus
        +dependencies: string[]
        +error?: Error
        +startedAt?: number
        +completedAt?: number
    }

    class DAGExecutionResult~TCtx~ {
        <<interface>>
        +success: boolean
        +context: TCtx
        +nodeStates: Map
        +errors: Array
        +durationMs: number
    }

    class DAGGraph~TCtx~ {
        -nodes: Map~string, DAGNodeState~
        +addNode(node, deps) this
        +validate() valid, error
        +execute(ctx: TCtx) Promise~DAGExecutionResult~
        +reset() void
        +getNodeIds() string[]
        +getNodeState(id) DAGNodeState
    }

    class ContextNode {
        +id = "context"
        -engine: ContextEngine
        +execute(ctx: PipelineContext)
    }

    class PromptNode {
        +id = "prompt"
        +execute(ctx: PipelineContext)
    }

    class InputBuildNode {
        +id = "input-build"
        +execute(ctx: PipelineContext)
    }

    class LLMNode {
        +id = "llm"
        -adapter: ILLMAdapter
        +execute(ctx: PipelineContext)
    }

    class ParseNode {
        +id = "parse"
        -parserType: ParserType
        +execute(ctx: PipelineContext)
    }

    IPipelineNode <|.. ContextNode : implements
    IPipelineNode <|.. PromptNode : implements
    IPipelineNode <|.. InputBuildNode : implements
    IPipelineNode <|.. LLMNode : implements
    IPipelineNode <|.. ParseNode : implements

    DAGGraph --> DAGNodeState : manages
    DAGGraph --> DAGExecutionResult : returns
    DAGNodeState --> IPipelineNode : wraps
    DAGGraph --> IPipelineNode : executes

    ContextNode --> ContextEngine : uses
    LLMNode --> ILLMAdapter : uses
    ParseNode --> outputParsers : uses
```

### 2-2. 라우트 레벨 노드 + 오케스트레이터

```mermaid
classDiagram
    direction TB

    class StoryRouteContext {
        <<interface>>
        +mode: GenerationMode
        +sheetId: string
        +sheetName: string
        +promptFile: string
        +rawData: any[][]
        +dictionary: Record~string, string~
        +emotions?: string[]
        +rows: BaseStoryRow[]
        +mainTemplate: string
        +groupedRows: Record~string, BaseStoryRow[]~
        +generationResults: StoryResult[]
        +currentSheetRows: any[]
        +mergedRows: any[]
    }

    class DataParseNode {
        +id = "data-parse"
        +execute(ctx) ctx.rows
    }

    class PromptLoadNode {
        +id = "prompt-load"
        +execute(ctx) ctx.mainTemplate
    }

    class GroupingNode {
        +id = "grouping"
        +execute(ctx) ctx.groupedRows
    }

    class GenerationNode {
        +id = "generation"
        +execute(ctx) ctx.generationResults
    }

    class SheetFetchNode {
        +id = "sheet-fetch"
        +execute(ctx) ctx.currentSheetRows
    }

    class MergeNode {
        +id = "merge"
        -mergeByKey(original, new) any[]
        -replaceByScene(original, new) any[]
        +execute(ctx) ctx.mergedRows
    }

    class SheetUpdateNode {
        +id = "sheet-update"
        +execute(ctx) side-effect
    }

    class DAGOrchestrator {
        -config: DAGOrchestratorConfig
        -contextEngine: ContextEngine
        -llmAdapter: ILLMAdapter
        -aggregator: IResultAggregator
        -graphFactory: GraphFactory
        +generateAll() Promise~StoryResult[]~
        +getAggregator() IResultAggregator
        +getContextEngine() ContextEngine
    }

    class DAGOrchestratorConfig {
        <<interface>>
        +rows: BaseStoryRow[]
        +mainTemplate: string
        +dictionary: Record~string, string~
        +mode: GenerationMode
        +llmAdapter?: ILLMAdapter
        +contextEngine?: ContextEngine
        +aggregator?: IResultAggregator
        +graphFactory?: GraphFactory
        +parserType?: ParserType
    }

    IPipelineNode~StoryRouteContext~ <|.. DataParseNode : implements
    IPipelineNode~StoryRouteContext~ <|.. PromptLoadNode : implements
    IPipelineNode~StoryRouteContext~ <|.. GroupingNode : implements
    IPipelineNode~StoryRouteContext~ <|.. GenerationNode : implements
    IPipelineNode~StoryRouteContext~ <|.. SheetFetchNode : implements
    IPipelineNode~StoryRouteContext~ <|.. MergeNode : implements
    IPipelineNode~StoryRouteContext~ <|.. SheetUpdateNode : implements

    GenerationNode --> DAGOrchestrator : creates per group
    DAGOrchestrator --> DAGOrchestratorConfig : configured by
    DAGOrchestrator --> DAGGraph : creates & executes
    DAGOrchestrator --> ContextEngine : uses
    DAGOrchestrator --> ILLMAdapter : uses
    DAGOrchestrator --> IResultAggregator : uses

    SheetFetchNode --> googleSheet : getSheetData()
    SheetUpdateNode --> googleSheet : updateSheetData()
```

### 2-3. ContextEngine + Provider 계층

```mermaid
classDiagram
    direction TB

    class ContextProvider {
        <<interface>>
        +canProvide(row, mode) boolean
        +provide(row, history) Record~string, string~
    }

    class ContextEngine {
        -providers: ContextProvider[]
        -mainTemplate: string
        +addProvider(provider) this
        +collectVariables(row, history, mode) Record~string, string~
        +buildPrompt(row, history, mode) string
    }

    class DictionaryProvider {
        -dictionaryText: string
        +canProvide() true
        +provide() oshiz_dictionary
    }

    class CommonRowProvider {
        +canProvide() true
        +provide(row) char, scene_id, key, Location, ...
    }

    class CharacterProfileProvider {
        +canProvide(row, mode) mode === single_line
        +provide(row) speaker, emotion, introContext, ...
        -resolveCharacterFile(speaker, level) string
    }

    class ConversationHistoryProvider {
        -singleLineMax: number
        -fullScriptMax: number
        +canProvide() true
        +provide(row, history) conversation_history, script_history
    }

    class FullScriptProfileProvider {
        +canProvide(row, mode) mode === full_script
        +provide(row) player_info, character_info, place, ...
    }

    ContextProvider <|.. DictionaryProvider
    ContextProvider <|.. CommonRowProvider
    ContextProvider <|.. CharacterProfileProvider
    ContextProvider <|.. ConversationHistoryProvider
    ContextProvider <|.. FullScriptProfileProvider

    ContextEngine o-- ContextProvider : has many
    ContextEngine ..> nunjucks : renders template
```

### 2-4. LLM 어댑터 + 라우터 계층

```mermaid
classDiagram
    direction LR

    class ILLMAdapter {
        <<interface>>
        +send(request: LLMRequest) Promise~LLMResponse~
        +sendJSON~T~(request: LLMRequest) Promise~T~
    }

    class DefaultLLMAdapter {
        +send(request) Promise~LLMResponse~
        +sendJSON~T~(request) Promise~T~
    }

    class LoggingLLMAdapter {
        -inner: ILLMAdapter
        +send(request) Promise~LLMResponse~
        +sendJSON~T~(request) Promise~T~
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

    class llmRouter {
        <<module>>
        +sendToLLM(request) Promise~LLMResponse~
        +sendToLLMJSON~T~(request) Promise~T~
        +resolveModelName(raw) LLMModelName
    }

    class IResultAggregator {
        <<interface>>
        +add(results: StoryResult[]) void
        +addHistoryLines(lines: string[]) void
        +getResults() StoryResult[]
        +getHistory() string[]
        +clear() void
    }

    class ResultAggregator {
        -results: StoryResult[]
        -history: string[]
    }

    class DeduplicatingAggregator {
        -resultMap: Map~string, StoryResult~
        -history: string[]
    }

    ILLMAdapter <|.. DefaultLLMAdapter
    ILLMAdapter <|.. LoggingLLMAdapter
    LoggingLLMAdapter o-- ILLMAdapter : decorates
    DefaultLLMAdapter --> llmRouter : delegates
    llmRouter --> sendToClaude : routes
    llmRouter --> sendToOpenAI : routes
    llmRouter --> sendToGemini : routes

    IResultAggregator <|.. ResultAggregator
    IResultAggregator <|.. DeduplicatingAggregator
```
