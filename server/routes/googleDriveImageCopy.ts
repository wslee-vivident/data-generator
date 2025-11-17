import express, { Request, Response } from "express";
import {
    listFilesInFolder,
    findFileObject,
    copyFileToFolder,
} from "../services/googleDrive";
import { file } from "googleapis/build/src/apis/file";

function chunkArray<T>(array : T[], size : number) : T[][] {
    const res : T[][] = [];
    for( let i = 0; i < array.length; i += size ) {
        res.push( array.slice(i, i + size));
    }
    return res;
}


const router = express.Router();

router.post("/copy-images", async (req, res) => {
    try {
        const { sourceFolderId, targetFolderId, data } = req.body;
        console.log("REQ BODY", req.body);
        
        if (!sourceFolderId || !targetFolderId || !Array.isArray(data)) {   
            return res.status(400).json({ error: "Invalid request body" });
        }
        
        const filePairs = twoDimArrayToJson(data);
        const results : any[] = [];
        
        // ⭐ 폴더 파일 목록을 1회만 조회
        const files = await listFilesInFolder(sourceFolderId);

        const batches = chunkArray(filePairs, 10); //10개씩 처리
        console.log(`Total batches to process: ${batches.length}`);


        // ⭐ 각 batch 병렬 수행
        for(const batch of batches) {
            console.log(`Processing batch of size: ${batch.length} items...`);

            const batchResults = await Promise.all(
                batch.map(async (row) => {
                    const fileName = row.OriginFile;
                    const newName = row.TargetFile;

                    const fileObj = findFileObject(files, fileName);
                    if(!fileObj) {
                        return {
                            origin : fileName,
                            success : false,
                            reason : "File not found in source folder"
                        };
                    }

                    try {
                        const copied = await copyFileToFolder(
                            fileObj.id!,
                            targetFolderId,
                            newName
                        );

                        return {
                            origin : fileName,
                            newName,
                            success : true,
                            fileId : copied.id,
                        };
                    } catch (error) {
                        return {
                            origin : fileName,
                            success : false,
                            reason : "Error copying file",
                            error : error instanceof Error ? error.message : String(error),
                        };
                    }
                })
            );

            results.push(...batchResults);
            console.log(`Batch processed. Total results so far: ${results.length}`);
        }

        //⭐ 최종 응답 반환
        return res.json({
            count : results.length,
            results,
        });

    } catch (error) {
        console.error("Error in /copy-images:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

export function twoDimArrayToJson(data : any[][]) : Record<string, string>[] {
    if(!Array.isArray(data) || data.length === 0) {
        return [];
    }

    const header = data[0];
    const rows = data.slice(1);

    return rows.map((row) => {
        const obj: Record<string, any> = {};

        header.forEach((col, i) => {
            obj[col] = row[i] ?? null;
        });

        return obj;
    });
}


export default router;
