import { google } from 'googleapis';

// ✅ 1. 인증 객체 생성 (서비스 계정용)
const auth = new google.auth.GoogleAuth({
    scopes : ['https://www.googleapis.com/auth/spreadsheets'],
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