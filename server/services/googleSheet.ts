import { google } from 'googleapis';
import { StoryResult } from '../types'; 

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
    
    const sheets = google.sheets({ version: 'v4', auth });
    console.log(`💾 Updating ${results.length} rows to Sheet: ${sheetName}...`);

    try {
        // [수정 1] 시트 전체 범위를 명시적으로 지정 ('SheetName'!A:Z)
        const readResponse = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `'${sheetName}'!A:Z`, 
        });

        const rows = readResponse.data.values;
        if (!rows || rows.length === 0) {
            throw new Error(`Sheet "${sheetName}" is empty or failed to load.`);
        }

        // 헤더에서 key, result 위치 찾기
        const headers = rows[0].map(h => String(h).trim());
        const keyColIndex = headers.indexOf('key');
        const resultColIndex = headers.indexOf('result');

        if (keyColIndex === -1) throw new Error("Column 'key' not found in header.");
        if (resultColIndex === -1) throw new Error("Column 'result' not found in header.");

        // Key 매핑
        const keyRowMap = new Map<string, number>();
        rows.forEach((row, index) => {
            const keyVal = row[keyColIndex]?.toString().trim();
            if (keyVal) {
                keyRowMap.set(keyVal, index);
            }
        });

        // 업데이트할 데이터 구성
        const dataToUpdate: any[] = [];
        const resultColLetter = columnIndexToLetter(resultColIndex);

        for (const item of results) {
            const rowIndex = keyRowMap.get(item.key.trim());
            
            if (rowIndex !== undefined) {
                const sheetRowNum = rowIndex + 1; // 1-based index
                
                // [수정 2] 시트 이름에 홑따옴표 추가하여 안전하게 포맷팅
                const range = `'${sheetName}'!${resultColLetter}${sheetRowNum}`;

                dataToUpdate.push({
                    range: range,
                    values: [[item.result]]
                });
            } else {
                console.warn(`⚠️ Key not found in sheet: ${item.key}`);
            }
        }

        if (dataToUpdate.length === 0) {
            console.log("⚠️ No matching keys found to update.");
            return;
        }

        // 일괄 업데이트 실행
        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            requestBody: {
                valueInputOption: 'USER_ENTERED',
                data: dataToUpdate
            }
        });

        console.log(`✅ Successfully batch updated ${dataToUpdate.length} cells.`);

    } catch (error: any) {
        // 에러 로그를 좀 더 자세히 출력
        console.error("❌ Failed to update sheet. Details:", error.message);
        if (error.response) {
            console.error("API Response Error:", error.response.data);
        }
        throw error;
    }
}

function columnIndexToLetter(index: number): string {
    let temp, letter = '';
    while (index >= 0) {
        temp = (index) % 26;
        letter = String.fromCharCode(temp + 65) + letter;
        index = (index - temp - 1) / 26;
        if (index < 0) break;
        index = Math.floor(index);
    }
    return letter;
}