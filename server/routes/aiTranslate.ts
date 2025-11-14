import express from 'express';
import { sendToOpenAI } from "../services/openAI";
import { sendToGemini } from "../services/googleGemini";
import { getSheetData, updateSheetData } from '../services/googleSheet';   
import fs from "fs";
import path from "path";

const router = express.Router();

router.post("/batch-translate", async (req, res) => {
    console.log("REQ BODY", req.body);
    try {
        const { data, languages, sheetName, sheetId , promptFile} = req.body;

        if(!data || !Array.isArray(data) || data.length === 0 || sheetId === "" || sheetName === "") { 
            return res.status(400).json({ error: "Invalid data format" });
        }
        console.log(`targetSheet : ${sheetName} \n FileId : ${sheetId}`);

        let systemPrompt = "";
        if(promptFile) {
            try {
                const filePath = path.resolve(process.cwd(), "prompts", promptFile);
                 if (!fs.existsSync(filePath)) {
                    console.error("❌ 파일이 존재하지 않음:", filePath);
                 }

                systemPrompt = fs.readFileSync(filePath, 'utf8');
                //console.log("✅ 시스템 프롬프트 로드 완료:", filePath);

            } catch (error) {
                console.error("Error reading prompt file:", error);
            }
        }      

        const baseBatchId = `job-${Date.now()}`;
        const BATCH_SIZE = 50; //배치 크기 설정
        
        const totalBatches = Math.ceil(data.length / BATCH_SIZE);
        const batches = Array.from({ length : totalBatches }, (_, i) => 
            data.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE)
        );
        
        const translations : { [lang : string] : Record<string, string> } = {};
        //각 배치 그룹에 대해 OpenAI로 번역 요청
        //여러 언어에 대해 번역 결과를 콜백 URL로 전송
        await Promise.all(
            batches.map(async (batchData, index) => {
                const batchId = `${baseBatchId}-bacth${index}`;
                const isLastBatch = index === totalBatches - 1;

                await Promise.all(
                    languages.map(async (lang:string) => {
                        const inputText = batchData.map(row => {
                            return Array.isArray(row)
                            ? `${row[0]}, ${row[1]}, ${row[2]}`
                            : `${row.key}, ${row.type}, ${row.text}`;
                        }).join("\n");

                        const prompt = systemPrompt.replaceAll("{{language_code}}", lang);
                        //const geminiResult = await sendToGemini(inputText, prompt);
                        //const translationMap = parseTranslationTextToMap(geminiResult);
                        const gptResult = await sendToOpenAI(inputText, prompt);
                        const translationMap = parseTranslationTextToMap(gptResult);

                        translations[lang] = translationMap;
                        console.log(`✅ ${lang} 번역 완료:`, translationMap);
                    })
                );

                const mergeRows = await mergeSheetData(sheetId, sheetName, translations);
                await updateSheetData(sheetId, sheetName, 2, mergeRows);
            })
        );
        
        res.status(200).json({ status: "OK", forwarded: true });

    } catch (err) {
        console.error("Error in /ai/batch-translate", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

function parseTranslationTextToMap(text : string) :Record<string, string> {
    const lines = text.split("\n").filter(line => line.trim() !== "");
    const map : Record<string, string> = {};
    
    const allowedTypes = [
        "label", "desc", "title", "radio", "checkbox",
        "btn", "toggle", "option", "dropdown", "etc", "sequence"
    ];

    for(const line of lines) {
        const [keyPart, ...rest] = line.split(",");
        const key = keyPart.trim();
        const valueRaw = rest.join(",").trim();
        const typeRegex = new RegExp(`^(${allowedTypes.join("|")})\\s*,?\\s*`, "i");
        
        const value = valueRaw.replace(typeRegex, "").trim();

        if(key && value) {
            map[key] = value;
        }
    }

    return map;
}

async function mergeSheetData(
    sheetId : string,
    sheetName : string, 
    newTranslations : Record<string, Record<string, string>>
) :Promise<Record<string, string>[]> {
    const existngRows = await getSheetData(sheetId, sheetName);

    // 2. key 기준 map
    const rowMap = new Map<string, Record<string, string>>();
    existngRows.forEach(row => {
        rowMap.set(row.key, {...row});
    });

    // 3. 병합
    Object.entries(newTranslations).forEach(([lang, langMap]) => {
        Object.entries(langMap).forEach(([key, text]) => {
            const existing = rowMap.get(key) || { key };
            existing[lang] = text;
            rowMap.set(key, existing);
        });
    });

    return Array.from(rowMap.values());
}

export default router;