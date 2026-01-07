import { google } from 'googleapis';
import { StoryResult } from 'server/types'; 

// ✅ 1. 인증 객체 생성 (서비스 계정용)
const auth = new google.auth.GoogleAuth({
    scopes : [
        'https://www.googleapis.com/auth/spreadsheets',
    ],
});

export const getSheetData = async (sheetId : string, sheetName : string, startRow = 1):Promise<Record<string,string>[]> => {
    const sheets = google.sheets( { version : 'v4', auth} );
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId : sheetId,
        range : sheetName
    });

    const values = response.data.values ?? [];
    if(values.length === 0) return [];

    // ✅ 헤더 추출 및 순서 보장
    const headers = values[0];
    const rows = values.slice(startRow);

    return rows.map((row) => {
        const obj: Record<string, string> = {};
        headers.forEach( (h, i) => {
            obj[h] = row[i] ?? '';
        });
        return obj;
    });
};

export const updateSheetData = async (
    sheetId : string,
    sheetName : string,
    startRow : number,
    jsonData : Record<string, string>[]
) => {
    const sheets = google.sheets( { version : 'v4', auth} );
    
    // ✅ 헤더 추출
    const headers = Object.keys(jsonData[0]);

    // ✅ 입력받은 파라미터 데이터, 2차원 배열 구조 변경
    const values : string[][] = jsonData.map( (obj) => headers.map( (key) => obj[key] ?? ''));
    // ✅ 시작 범위 지정
    const startCell = `A${startRow}`;
    const range = `${sheetName}!${startCell}`;
    
    
    const response = await sheets.spreadsheets.values.update({
        spreadsheetId : sheetId,
        range,
        valueInputOption : 'RAW',
        requestBody : { values }
    });

    return {
        message :`✅ ${sheetName} 시트 ${startCell}부터 ${values.length}행 덮어쓰기 완료`,
        updatedRange : response.data.updatedRange
    }
};

export const appendSheetData = async (
    sheetId : string,
    sheetName : string,
    jsonData : Record<string, string>[]
) => {
    const sheets = google.sheets( { version : 'v4', auth} );
    
    // ✅ 헤더 추출
    const headers = Object.keys(jsonData[0]);
    // ✅ 입력받은 파라미터 데이터, 2차원 배열 구조 변경
    const values : string[][] = jsonData.map( (obj) => headers.map( (key) => obj[key] ?? ''));
    
    
    const response = await sheets.spreadsheets.values.append({
        spreadsheetId : sheetId,
        range : `${sheetName}!A1`,
        valueInputOption : 'INSERT_ROWS',
        requestBody : { values }
    });

    return {
        message :`✅ ${sheetName} 시트에 ${values.length}개의 행 추가 완료`,
        updatedRange : response.data.updates?.updatedRange
    }
};

export async function updateStoryResults(
    spreadsheetId: string,
    sheetName: string,
    results: StoryResult[]
) {
    if (results.length === 0) {
        console.log("⚠️ No results to update.");
        return;
    }
    const sheets = google.sheets( { version : 'v4', auth} );
    console.log(`💾 Updating ${results.length} rows to Sheet: ${sheetName}...`);

    try {
        // Step 1: 시트의 현재 데이터(헤더 및 키 값 확인용) 가져오기
        const readResponse = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: sheetName, // 시트 전체 범위 자동 감지
        });

        const rows = readResponse.data.values;
        if (!rows || rows.length === 0) {
            throw new Error(`Sheet "${sheetName}" is empty.`);
        }

        // Step 2: 헤더에서 'key'와 'result' 컬럼의 인덱스 찾기
        const headers = rows[0].map(h => String(h).trim());
        const keyColIndex = headers.indexOf('key');
        const resultColIndex = headers.indexOf('result');

        if (keyColIndex === -1) throw new Error("Column 'key' not found in header.");
        if (resultColIndex === -1) throw new Error("Column 'result' not found in header.");

        // Step 3: 키(Key)가 몇 번째 행(Row)에 있는지 매핑 (Header가 0번이므로 데이터는 1번부터)
        // Map<KeyString, RowIndex(0-based)>
        const keyRowMap = new Map<string, number>();
        rows.forEach((row, index) => {
            const keyVal = row[keyColIndex]?.toString().trim();
            if (keyVal) {
                keyRowMap.set(keyVal, index);
            }
        });

        // Step 4: 업데이트할 데이터 페이로드(ValueRange) 구성
        const dataToUpdate: any[] = [];
        
        // 결과 컬럼의 알파벳 좌표 계산 (예: 6 -> 'G')
        const resultColLetter = columnIndexToLetter(resultColIndex);

        for (const item of results) {
            const rowIndex = keyRowMap.get(item.key.trim());
            
            // 시트에 키가 존재하는 경우에만 업데이트 대상에 추가
            if (rowIndex !== undefined) {
                // 구글 시트 행 번호는 1부터 시작 (배열 인덱스 + 1)
                const sheetRowNum = rowIndex + 1;
                
                // 범위 지정: 시트명!열행 (예: "Sheet1!G5")
                const range = `${sheetName}!${resultColLetter}${sheetRowNum}`;

                dataToUpdate.push({
                    range: range,
                    values: [[item.result]] // 2차원 배열 형태여야 함
                });
            } else {
                console.warn(`⚠️ Key not found in sheet: ${item.key} (Skipping)`);
            }
        }

        if (dataToUpdate.length === 0) {
            console.log("⚠️ No matching keys found to update.");
            return;
        }

        // Step 5: spreadsheets.values.batchUpdate 호출 (한 번에 전송)
        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            requestBody: {
                valueInputOption: 'USER_ENTERED', // 텍스트 그대로 입력
                data: dataToUpdate
            }
        });

        console.log(`✅ Successfully batch updated ${dataToUpdate.length} cells.`);

    } catch (error: any) {
        console.error("❌ Failed to update sheet:", error.message);
        throw error;
    }
}

/**
 * 0-based 인덱스를 엑셀 컬럼 문자(A, B, ... AA, AB)로 변환하는 헬퍼 함수
 * 예: 0 -> A, 25 -> Z, 26 -> AA
 */
function columnIndexToLetter(index: number): string {
    let temp, letter = '';
    while (index >= 0) {
        temp = (index) % 26;
        letter = String.fromCharCode(temp + 65) + letter;
        index = (index - temp - 1) / 26;
        if (index < 0) break; // 루프 종료 조건 명시
        index = Math.floor(index); // TypeScript 안전성
    }
    return letter;
}