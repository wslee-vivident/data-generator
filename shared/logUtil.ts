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