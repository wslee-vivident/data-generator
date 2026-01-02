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
    try {
        const filePath = path.resolve(process.cwd(), "prompts", fileName);
        if(fs.existsSync(filePath)) {
            return fs.readFileSync(filePath, 'utf8');
        }
    } catch (e) { /* ignore */ }

    if(fallbackFileName) {
        try {
            const fallbackPath = path.resolve(process.cwd(), "prompts", fallbackFileName);
            return fs.readFileSync(fallbackPath, 'utf8');
        } catch (e) { 
            console.error('Prompt file not found:', fallbackFileName);
        }
    }

    return ""
}