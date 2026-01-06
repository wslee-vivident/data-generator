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
    try {
            const { data, dictionary, sheetName, sheetId, promptFile } = req.body;
            if(
                !data ||
                !Array.isArray(data) ||
                data.length === 0 ||
                dictionary.length === 0 ||
                sheetId === "" ||
                sheetName === ""
            ) {
                return res.status(400).json({error : "Invalid data format"});
            }

            const obj = parseSheetDataToObjects(data);
            console.log(obj);
    
           
            return res.status(200).json({ status: "OK"});
    
        } catch (err) {
            console.error("Error in /ai/batch-group-translate", err);
            res.status(500).json({ error: "Internal Server Error" });
        }
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