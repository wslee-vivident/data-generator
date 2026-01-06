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
    const { data, sheetName, sheetId, promptFile, model } = req.body;
    

});

export default router;