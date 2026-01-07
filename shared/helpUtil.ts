import * as path from 'path';
import * as fs from 'fs';

const rootLogDir = path.resolve(__dirname, '../../logs');

export function writeLog(fileName : string, content : string | object) : void {
    try {
         // 💡 __dirname은 현재 모듈 위치 (shared/)
        // → ../logs = 프로젝트 루트의 logs
        const data = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
        const filePath = path.join(rootLogDir, fileName);
        
        if(!fs.existsSync(rootLogDir)) fs.mkdirSync(rootLogDir, { recursive : true });

        fs.writeFileSync(filePath, data, 'utf8');
        console.log(`📝 로그 저장됨: ${filePath}`);

    } catch (err) {
        console.error("❌ 로그 저장 실패:", err);
    }
}

export function loadPrompt(fileName : string, fallbackFileName? : string) : string {
    const promptDir = path.resolve(process.cwd(), "prompts");

    try {
        const filePath = path.join(promptDir, fileName);
        if(fs.existsSync(filePath)) {
            return fs.readFileSync(filePath, 'utf8');
        }
    } catch (e) { /* ignore */ }

    if(fallbackFileName) {
        try {
            const fallbackPath = path.join(promptDir, fallbackFileName);
            if(fs.existsSync(fallbackPath)) {
                return fs.readFileSync(fallbackPath, 'utf8');
            }
        } catch (e) { 
            console.error('Prompt file not found:', fallbackFileName);
        }
    }

    return "";
}

export function parseSheetToObject(data: any[][]): any[] {
    if (!data || !Array.isArray(data) || data.length < 2) {
        return [];
    }

    const headers = data[0].map(h => String(h).trim()); // 첫 줄: 헤더
    const rows = data.slice(1); // 나머지: 데이터

    return rows.map(row => {
        const obj: any = {};
        headers.forEach((header, index) => {
            // 헤더 이름과 매칭하여 객체 생성
            // 값이 없으면 빈 문자열 처리
            obj[header] = row[index] ?? "";
        });
        return obj;
    });
}