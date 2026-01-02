import express from 'express';
import { sendToOpenAI } from "../services/openAI";
import { sendToGemini } from "../services/googleGemini";
import { getSheetData, updateSheetData } from '../services/googleSheet';   
import fs from "fs";
import path from "path";

const router = express.Router();
router.post("/story-generate", async (req, res) => {
    console.log("REQ BODY", req.body);
    
});