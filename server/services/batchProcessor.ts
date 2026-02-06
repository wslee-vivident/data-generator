// =================================================================
//  배치 처리 유틸리티
//  여러 라우트에서 공통으로 사용하는 배치 처리 패턴을 추출합니다.
//  데이터를 일정 크기의 배치로 나누어 처리합니다.
// =================================================================

/**
 * 배열을 지정 크기의 청크로 분할
 */
export function chunkArray<T>(items: T[], batchSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
        chunks.push(items.slice(i, i + batchSize));
    }
    return chunks;
}

/**
 * 배치 단위로 데이터를 처리하고 결과를 합쳐 반환
 * 배치 간 병렬 처리 (Promise.all 사용)
 *
 * @param items - 처리할 전체 데이터 배열
 * @param batchSize - 배치당 항목 수
 * @param processor - 배치 하나를 처리하는 함수
 * @returns 모든 배치 결과를 합친 배열
 */
export async function processBatchesParallel<TInput, TOutput>(
    items: TInput[],
    batchSize: number,
    processor: (batch: TInput[]) => Promise<TOutput[]>
): Promise<TOutput[]> {
    const batches = chunkArray(items, batchSize);

    console.log(`📦 배치 처리 시작: ${items.length}개 항목 → ${batches.length}개 배치 (크기: ${batchSize})`);

    const batchPromises = batches.map((batch, index) => {
        console.log(`  ➤ 배치 ${index + 1}/${batches.length} (${batch.length}개)`);
        return processor(batch);
    });

    const resultsArray = await Promise.all(batchPromises);
    return resultsArray.flat();
}

/**
 * 배치 단위로 데이터를 순차 처리 (Rate Limit 방지용)
 * 배치 간 순차 처리, 배치 내부는 processor가 결정
 *
 * @param items - 처리할 전체 데이터 배열
 * @param batchSize - 배치당 항목 수
 * @param processor - 배치 하나를 처리하는 함수
 * @returns 모든 배치 결과를 합친 배열
 */
export async function processBatchesSequential<TInput, TOutput>(
    items: TInput[],
    batchSize: number,
    processor: (batch: TInput[]) => Promise<TOutput[]>
): Promise<TOutput[]> {
    const batches = chunkArray(items, batchSize);
    const results: TOutput[] = [];

    console.log(`📦 순차 배치 처리: ${items.length}개 항목 → ${batches.length}개 배치`);

    for (let i = 0; i < batches.length; i++) {
        console.log(`  ➤ 배치 ${i + 1}/${batches.length} (${batches[i].length}개)`);
        const batchResults = await processor(batches[i]);
        results.push(...batchResults);
    }

    return results;
}
