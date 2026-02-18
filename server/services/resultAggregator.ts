import { StoryResult } from '../types';

// =================================================================
//  ResultAggregator - 결과 집계기
//
//  여러 DAG 실행(row 단위)의 결과를 모아 최종 결과를 생성합니다.
//  히스토리 관리도 담당하여, 이전 row의 결과가
//  다음 row의 컨텍스트에 연속성 있게 반영됩니다.
//
//  제어 흐름에서의 위치:
//    LLMAdapter → ParseNode → ResultAggregator → Orchestrator
// =================================================================

/** 결과 집계기 인터페이스 */
export interface IResultAggregator {
    /** 파싱된 결과를 추가 */
    add(results: StoryResult[]): void;
    /** 히스토리 라인 추가 (다음 row 컨텍스트에 반영) */
    addHistoryLines(lines: string[]): void;
    /** 누적된 전체 결과 반환 */
    getResults(): StoryResult[];
    /** 누적된 히스토리 반환 */
    getHistory(): string[];
    /** 전체 상태 초기화 */
    clear(): void;
}

/**
 * 기본 결과 집계기 구현
 * 단순 배열 기반으로 결과와 히스토리를 누적합니다.
 */
export class ResultAggregator implements IResultAggregator {
    private results: StoryResult[] = [];
    private history: string[] = [];

    add(results: StoryResult[]): void {
        this.results.push(...results);
    }

    addHistoryLines(lines: string[]): void {
        this.history.push(...lines);
    }

    getResults(): StoryResult[] {
        return [...this.results];
    }

    getHistory(): string[] {
        return [...this.history];
    }

    clear(): void {
        this.results = [];
        this.history = [];
    }
}

/**
 * 필터링 결과 집계기
 * 중복 키를 허용하지 않으며, 동일 키의 경우 최신 결과로 덮어씁니다.
 */
export class DeduplicatingAggregator implements IResultAggregator {
    private resultMap: Map<string, StoryResult> = new Map();
    private history: string[] = [];

    add(results: StoryResult[]): void {
        for (const result of results) {
            this.resultMap.set(result.key, result);
        }
    }

    addHistoryLines(lines: string[]): void {
        this.history.push(...lines);
    }

    getResults(): StoryResult[] {
        return Array.from(this.resultMap.values());
    }

    getHistory(): string[] {
        return [...this.history];
    }

    clear(): void {
        this.resultMap.clear();
        this.history = [];
    }
}
