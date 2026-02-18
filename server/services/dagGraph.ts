import { INode, DAGNodeState, DAGExecutionResult, PipelineContext } from '../types';

// =================================================================
//  DAGGraph<T> - 제네릭 DAG 실행 엔진
//
//  노드(INode)와 의존성(dependencies)으로 구성된 방향 비순환 그래프.
//  의존성이 충족된 노드들은 병렬로 실행되며,
//  실패 시 의존 노드들은 자동으로 스킵 처리됩니다.
//
//  T = 입력 데이터 타입. 코어 엔진은 T가 무엇인지 알 필요 없이 동작합니다.
//
//  사용 예시:
//    const graph = new DAGGraph<MyInput>();
//    graph.addNode(nodeA, []).addNode(nodeB, ['a']);
//    const result = await graph.execute({ input: myData, outputs: {}, ... });
// =================================================================

export class DAGGraph<T = any> {
    private nodes: Map<string, DAGNodeState<T>> = new Map();

    /**
     * 노드 추가 (체이닝 지원)
     * @param node - 파이프라인 노드
     * @param dependencies - 선행 노드 ID 목록 (이 노드들이 완료되어야 실행 가능)
     */
    addNode(node: INode<T>, dependencies: string[] = []): this {
        if (this.nodes.has(node.id)) {
            throw new Error(`노드 ID 중복: ${node.id}`);
        }
        this.nodes.set(node.id, {
            node,
            status: 'pending',
            dependencies,
        });
        return this;
    }

    /**
     * DAG 유효성 검증
     * 1. 모든 의존성 노드가 존재하는지 확인
     * 2. 순환 참조(Cycle) 탐지 (DFS 기반)
     */
    validate(): { valid: boolean; error?: string } {
        // 1. 의존성 존재 여부 확인
        for (const [id, state] of this.nodes) {
            for (const dep of state.dependencies) {
                if (!this.nodes.has(dep)) {
                    return {
                        valid: false,
                        error: `노드 '${id}'의 의존성 '${dep}'이(가) 존재하지 않습니다`,
                    };
                }
            }
        }

        // 2. DFS 기반 순환 참조 탐지
        const visited = new Set<string>();
        const inStack = new Set<string>();

        const hasCycle = (nodeId: string): boolean => {
            if (inStack.has(nodeId)) return true;
            if (visited.has(nodeId)) return false;

            visited.add(nodeId);
            inStack.add(nodeId);

            const state = this.nodes.get(nodeId)!;
            for (const dep of state.dependencies) {
                if (hasCycle(dep)) return true;
            }

            inStack.delete(nodeId);
            return false;
        };

        for (const id of this.nodes.keys()) {
            if (!visited.has(id) && hasCycle(id)) {
                return { valid: false, error: '순환 참조가 감지되었습니다' };
            }
        }

        return { valid: true };
    }

    /**
     * DAG 실행
     * 의존성이 충족된 노드들을 병렬로 실행합니다.
     * 노드 실패 시 해당 노드에 의존하는 후속 노드들은 스킵됩니다.
     */
    async execute(ctx: PipelineContext<T>): Promise<DAGExecutionResult<T>> {
        const startTime = Date.now();
        const errors: Array<{ nodeId: string; error: Error }> = [];

        // 실행 전 유효성 검증
        const validation = this.validate();
        if (!validation.valid) {
            throw new Error(`DAG 유효성 검증 실패: ${validation.error}`);
        }

        const completed = new Set<string>();
        const failed = new Set<string>();

        // 의존성 순서에 따라 반복 실행 (토폴로지 정렬 기반)
        while (completed.size + failed.size < this.nodes.size) {
            const ready = this.findReadyNodes(completed, failed);

            if (ready.length === 0) {
                this.markRemainingAsSkipped(completed, failed);
                break;
            }

            // 의존성이 충족된 독립 노드들은 병렬 실행
            const results = await Promise.allSettled(
                ready.map(state => this.executeNode(state, ctx))
            );

            results.forEach((result, index) => {
                const state = ready[index];
                if (result.status === 'fulfilled') {
                    completed.add(state.node.id);
                } else {
                    failed.add(state.node.id);
                    const error = result.reason instanceof Error
                        ? result.reason
                        : new Error(String(result.reason));
                    errors.push({ nodeId: state.node.id, error });
                }
            });

            if (failed.size > 0) {
                this.markRemainingAsSkipped(completed, failed);
                break;
            }
        }

        return {
            success: errors.length === 0,
            context: ctx,
            nodeStates: new Map<string, DAGNodeState<T>>(this.nodes),
            errors,
            durationMs: Date.now() - startTime,
        };
    }

    /** 의존성이 충족된 실행 가능 노드 탐색 */
    private findReadyNodes(completed: Set<string>, failed: Set<string>): DAGNodeState<T>[] {
        const ready: DAGNodeState<T>[] = [];

        for (const [, state] of this.nodes) {
            if (state.status !== 'pending') continue;

            const depsFailed = state.dependencies.some(dep => failed.has(dep));
            if (depsFailed) {
                state.status = 'skipped';
                continue;
            }

            const depsReady = state.dependencies.every(dep => completed.has(dep));
            if (depsReady) {
                ready.push(state);
            }
        }

        return ready;
    }

    /** 단일 노드 실행 (상태 추적 포함) */
    private async executeNode(state: DAGNodeState<T>, ctx: PipelineContext<T>): Promise<void> {
        state.status = 'running';
        state.startedAt = Date.now();

        try {
            console.log(`  ▶ [${state.node.id}] ${state.node.name} 실행 중...`);
            await state.node.execute(ctx);
            state.status = 'completed';
            state.completedAt = Date.now();
            console.log(`  ✓ [${state.node.id}] 완료 (${state.completedAt - state.startedAt}ms)`);
        } catch (error) {
            state.status = 'failed';
            state.error = error as Error;
            state.completedAt = Date.now();
            console.error(`  ✗ [${state.node.id}] 실패:`, error);
            throw error;
        }
    }

    /** 미실행 노드를 스킵 처리 */
    private markRemainingAsSkipped(completed: Set<string>, failed: Set<string>): void {
        for (const [id, state] of this.nodes) {
            if (!completed.has(id) && !failed.has(id) && state.status === 'pending') {
                state.status = 'skipped';
            }
        }
    }

    /** 전체 노드 상태 리셋 (재실행용) */
    reset(): void {
        for (const [, state] of this.nodes) {
            state.status = 'pending';
            state.error = undefined;
            state.startedAt = undefined;
            state.completedAt = undefined;
        }
    }

    /** 등록된 노드 ID 목록 */
    getNodeIds(): string[] {
        return Array.from(this.nodes.keys());
    }

    /** 특정 노드 상태 조회 */
    getNodeState(id: string): DAGNodeState<T> | undefined {
        return this.nodes.get(id);
    }

    /** 등록된 노드 수 */
    get size(): number {
        return this.nodes.size;
    }
}
