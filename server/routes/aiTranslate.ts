import express from 'express';
import { sendToOpenAI } from "../services/openAI";
import { sendToGemini } from "../services/googleGemini";
import { getSheetData, updateSheetData } from '../services/googleSheet';   
import fs from "fs";
import path from "path";
import { batch } from 'googleapis/build/src/apis/batch';

const router = express.Router();

const ALLOWED_TYPES = [
    "label", "desc", "title", "radio", "checkbox",
    "btn", "toggle", "option", "dropdown", "etc", "characterDialog"
];

router.post("/batch-group-translate", async (req, res) => {
    console.log("REQ BODY", req.body);
    try {
        const { data, languages, sheetName, sheetId, promptFile } = req.body;

        console.log(`targetSheet : ${sheetName} \n FileId : ${sheetId}`);
        
        //parse sheet values to Objects
        const objectData = parseSheetDataToObjects(data);

        //Step.1 data grouping
        const groupedData = groupDataByStrategy(objectData);

        //Step.2 translate all of groups in parallel per language
        const allTranslations = await processAllGroups(groupedData, languages, promptFile);

        //Step.3 merge and update sheet atomic update
        console.log("Applying all translations to sheet...");

        //Part.1 get existing rows
        const currentSheetRows = await getSheetData(sheetId, sheetName);

        //Part.2 Merge all translations with the existing rows (sheet data)
        const mergedRows = mergeTranslationsInMemory(currentSheetRows, allTranslations);

        //Part.3 Update sheet once
        await updateSheetData(sheetId, sheetName, 2, mergedRows);

        console.log("✅ All batches completed and sheet updated safely.");
        return res.status(200).json({ status: "OK"});

    } catch (err) {
        console.error("Error in /ai/batch-group-translate", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

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

            //const translateResult = await sendToOpenAI(inputText, prompt);
            const translateResult = await sendToGemini(inputText, prompt);
            perLang[lang] = parseTranslationTextToMap(translateResult);
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

export function parseSheetDataToObjects(data : any[][]) : Record<string, any>[] {
    if(!Array.isArray(data) || data.length === 0) {
        return [];
    }

    const headers = data[0].map( h => String(h).trim());

    const rows = data.slice(1);

    return rows.map(row => {
        const obj : Record<string, any> = {};
        headers.forEach( (header, index) => {
            obj[header] = row[index] ?? "";
        });
        return obj;
    });
}

function groupDataByStrategy(dataObj : Record<string, any>[]) {
    const groups : Record<string, any[]> = {
        'default' : []
    };

    for(const row of dataObj) {
        const type = row['#type'];
        const character = row['#character'];

        if(type === "characterDialog" && character && character.trim() !== "") {
            const strategyKey = `character_${character.trim()}`;

            if(!groups[strategyKey]) {
                groups[strategyKey] = [];
            }
            groups[strategyKey].push(row);
        } else {
            groups['default'].push(row);
        }
    }

    return groups;
}

async function processAllGroups(
    groupedData : Record<string, any[]> ,
    languages : string[],
    defaultPromptFile : string
) : Promise<Record<string, Record<string, string>>> {
    const finalResult : Record<string, Record<string, string>> = {};

    const groupPromises = Object.entries(groupedData).map(async ([strategyKey, rows]) => {
        if(rows.length === 0) return;

        let promptContent = "";
        if(strategyKey === 'default') {
            promptContent = loadPrompt(defaultPromptFile);
        } else {
            // strategyKey가 'character_비앙카'라면 -> 'prompt_character_비앙카.txt' 로드 시도
            // 파일이 없으면 기본 프롬프트 사용
            const charName = strategyKey.replace('character_', '');
            const charPromptFile = `prompt_character_${charName}.txt`;
            promptContent = loadPrompt(charPromptFile, defaultPromptFile);
        }

        console.log(`🚀 Starting Group: [${strategyKey}] / Rows: ${rows.length}`);

        const groupTranslations = await processBatchForGroup(rows, languages, promptContent);

        Object.assign(finalResult, groupTranslations);
    });

    await Promise.all(groupPromises);
    return finalResult;
}

/**
 * 특정 그룹의 데이터를 Batch로 나누어 번역하고 결과를 반환 (시트 쓰기 없음)
 */
async function processBatchForGroup(rows : any[], languages : string[], systemPrompt : string) {
    const BATCH_SIZE = 20;
    const totalBatches = Math.ceil(rows.length / BATCH_SIZE);
    const batches : any[] = Array.from( { length : totalBatches }, (_, i) => {
        rows.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
    });

     // map은 각 배치별로 translateOneBatch 함수를 호출하고, 그 결과(Promise)들의 배열을 반환합니다.
     const batchPromises = batches.map(batchData => {
        return translateOneBatch(batchData, languages, systemPrompt);
     });

     // results에는 각 배치의 결과가 배열 순서대로 담깁니다.
     const resultsArray = await Promise.all(batchPromises);

     // 4. 결과를 하나로 합치기
     const groupResults : Record<string, Record<string, string>> = {};

      // resultsArray 구조: [ {Batch1결과}, {Batch2결과}, ... ]
     for(const batchResult of resultsArray) {
        for(const [lang, keyMap] of Object.entries(batchResult)) {
            for(const [key, text] of Object.entries(keyMap)) {
                if(!groupResults[key]) groupResults[key] = {};
                groupResults[key][lang] = text;
            }
        }
    }  

     return groupResults;
}

function mergeTranslationsInMemory(
    originalRows : any[],
    newTranslations : Record<string, Record<string, string>>
) : any[] {
    // key 기준 매핑
    const rowMap = new Map<string, any>();
    originalRows.forEach(row => {
        const k = String(row.key ?? "").trim();
        if(k) rowMap.set(k, {...row});
    });

    // 번역 데이터 반영
    for(const [key, langMap] of Object.entries(newTranslations)) {
        const normalizedKey = String(key).trim();
        const existing = rowMap.get(normalizedKey);

        if(existing) {
            // 해당 키가 시트에 존재할 경우에만 업데이트
            for(const [lang, text] of Object.entries(langMap)) {
                // ✅ 빈 값이 아니고, 유효한 번역일 때만 덮어쓰기 (User Requirement)
                if(text && text.trim() !== "") {
                    existing[lang] = text;
                }
            }
            rowMap.set(normalizedKey, existing);
        }
    }

    return Array.from(rowMap.values());
}

function loadPrompt(fileName : string, fallbackFileName? : string) : string {
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