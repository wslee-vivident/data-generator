import express from 'express';
import { sendToOpenAI } from "../services/openAI";
import { sendToGemini } from "../services/googleGemini";
import { getSheetData, updateSheetData } from '../services/googleSheet';   
import { loadPrompt }  from '@shared/logUtil';
import fs from "fs";
import path from "path";

const router = express.Router();
router.post("/story-generate", async (req, res) => {
    console.log("REQ BODY", req.body);
    const { data, sheetName, sheetId, promptFile } = req.body;

    const obj = parseSheetDataToObjects(data);
    console.log(obj);

});

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

export default router;