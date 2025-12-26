import express from 'express';
import { sendToOpenAI } from "../services/openAI";
import { sendToGemini } from "../services/googleGemini";
import { getSheetData, updateSheetData } from '../services/googleSheet';   
import fs from "fs";
import path from "path";

const router = express.Router();

const ALLOWED_TYPES = [
    "label", "desc", "title", "radio", "checkbox",
    "btn", "toggle", "option", "dropdown", "etc", "characterDialog"
];

router.post("/batch-translate", async (req, res) => {
    console.log("REQ BODY", req.body);
    try {
        const { data, languages, sheetName, sheetId , promptFile} = req.body;

        if(
            !data ||
            !Array.isArray(data) ||
            data.length === 0 ||
            !languages ||
            !Array.isArray(languages) ||
            languages.length === 0 ||
            sheetId === "" ||
            sheetName === ""
        ) {
            return res.status(400).json({error : "Invalid data format"});
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
        
        // # 배치 분할
        const BATCH_SIZE = 20;
        const totalBatches = Math.ceil(data.length / BATCH_SIZE);
        const batches = Array.from({ length : totalBatches }, (_, i) => 
            data.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE)
        );

         // ✅ 핵심: "시트 쓰기"는 직렬 처리 (for-loop)
         for(let index = 0; index < batches.length; index++) {
            const batchData = batches[index];
            const batchId = `job-${Date.now()}-$batch${index}`;

            console.log(`\n--- Processing ${batchId} (${index + 1}/${totalBatches}) ---`);

            // # 배치 번역: 언어는 병렬
            const batchTranslations = await translateOneBatch(batchData, languages, systemPrompt);

            // # 시트 반영: get → merge → update (직렬이므로 경쟁상태 제거)
            const mergedRows = await mergeSheetDataSafe(sheetId, sheetName, batchTranslations);

            // updateSheetData(sheetId, sheetName, headerRowCount, rows)
            await updateSheetData(sheetId, sheetName, 2, mergedRows);

            console.log(`✅ Sheet updated for batch ${index + 1}/${totalBatches}`);
         }

         return res.status(200).json({ status : "OK" });
        
    } catch (err) {
        console.error("Error in /ai/batch-translate", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

async function translateOneBatch(
    batchData : any[],
    languages : string[],
    systemPrompt : string,
) : Promise<Record<string, Record<string, string>>> {
    const perLang : Record<string, Record<string, string>> = {};

    await Promise.all(
        languages.map(async (lang) => {
            const inputText = batchData
                .map((row) => {
                    return Array.isArray(row)
                        ? `${row[0]}, ${row[1]}, ${row[2]}`
                        : `${row.key}, ${row.type}, ${row.text}`;
                })
                .join("\n");
            
            const prompt = systemPrompt.replaceAll("{{language_code}}", lang);

            const gptResult = await sendToOpenAI(inputText, prompt);
            perLang[lang] = parseTranslationTextToMap(gptResult);
        })
    );

    return perLang;
}

function parseTranslationTextToMap(text : string) :Record<string, string> {
    const lines = text.split("\n").filter(line => line.trim() !== "");
    const map : Record<string, string> = {};
    
    const typeRegex = new RegExp(`^(${ALLOWED_TYPES.join("|")})\\s*,?\\s*`, "i");

    for(const line of lines) {
        const [keyPart, ...rest] = line.split(",");
        const key = (keyPart ?? "").trim();
        const valueRaw = rest.join(",").trim();
        
        const value = valueRaw.replace(typeRegex, "").trim();

        if(key && value) {
            map[key] = value;
        }
    }

    return map;
}

async function mergeSheetDataSafe(
    sheetId : string,
    sheetName : string, 
    newTranslations : Record<string, Record<string, string>>
) :Promise<Record<string, any>[]> {
    const existingRows = await getSheetData(sheetId, sheetName);

    // 2. key 기준 rowMap
    const rowMap = new Map<string, Record<string, any>>();
    existingRows.forEach((row : any) => {
        const k = String(row.key ?? "").trim();
        if (k) rowMap.set(k, {...row});
    });

    // 3. 병합 : 빈 값이면 기존 유지
    for(const [lang, langMap] of Object.entries(newTranslations)) {
        for(const [key, text] of Object.entries(langMap)) {
            const normalizedKey = String(key ?? "").trim();
            if(!normalizedKey) continue;

            const existing = rowMap.get(normalizedKey) || { key : normalizedKey };

            // ✅ 새 번역이 유효할 때만 덮어쓰기
            if(text && text.trim() !== "") {
                existing[lang] = text;
            }

            rowMap.set(normalizedKey, existing);
        }
    }
    

    return Array.from(rowMap.values());
}

export default router;