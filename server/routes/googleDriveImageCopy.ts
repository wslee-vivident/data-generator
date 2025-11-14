import express, { Request, Response } from "express";
import { google } from "googleapis";

const router = express.Router();
const auth = new google.auth.GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/drive"],
});
const drive = google.drive({ version: "v3", auth });

interface FileCopyItem {
  realFile: string;
  targetName: string;
}
interface CopyImageRequestBody {
  sourceFolderId: string;
  targetFolderId: string;
  data: any[][];
}

// ✅ 유틸: 배열을 n개 단위로 나누는 함수
function chunkArray<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

router.post(
  "/copy-images",
  async (req: Request<{}, {}, CopyImageRequestBody>, res: Response) => {
    try {
      const { sourceFolderId, targetFolderId, data } = req.body;

      if (!Array.isArray(data) || data.length < 2) {
        return res.status(400).json({ error: "data 2차원 배열이 필요합니다." });
      }

      const header = data[0];
      const originIdx = header.indexOf("OriginFile");
      const targetIdx = header.indexOf("TargetFile");

      if (originIdx === -1 || targetIdx === -1) {
        return res
          .status(400)
          .json({ error: "헤더에 OriginFile / TargetFile 컬럼이 필요합니다." });
      }

      const items: FileCopyItem[] = data
        .slice(1)
        .filter((row) => row[originIdx] && row[targetIdx])
        .map((row) => ({
          realFile: row[originIdx],
          targetName: row[targetIdx],
        }));

      if (items.length === 0) {
        return res.status(400).json({ error: "복제할 데이터가 없습니다." });
      }

      // ✅ Batch 처리 (10개씩)
      const chunkSize = 10;
      const batches = chunkArray(items, chunkSize);
      const results: any[] = [];

      for (const batch of batches) {
        const batchResults = await Promise.allSettled(
          batch.map(async ({ realFile, targetName }) => {
            try {
              const q = `'${sourceFolderId}' in parents and name='${realFile}.png' and trashed=false`;
              const resp = await drive.files.list({
                q,
                fields: "files(id, name, mimeType)",
              });

              const files = resp.data.files;
              if (!files || files.length === 0)
                return { realFile, status: "not_found" };

              const file = files[0];
              const fileName = file.name ?? `${realFile}.png`;
              const ext = fileName.split(".").pop() ?? "png";
              const newName = targetName.endsWith(`.${ext}`)
                ? targetName
                : `${targetName}.${ext}`;

              // 기존 파일 삭제
              const existing = await drive.files.list({
                q: `'${targetFolderId}' in parents and name='${newName}' and trashed=false`,
                fields: "files(id)",
              });
              for (const f of existing.data.files ?? []) {
                if (f.id) {
                  await drive.files.update({
                    fileId: f.id,
                    requestBody: { trashed: true },
                  });
                }
              }

              // 복제 생성
              const copy = await drive.files.copy({
                fileId: file.id!,
                requestBody: { name: newName, parents: [targetFolderId] },
              });

              return { realFile, newFileId: copy.data.id, status: "ok" };
            } catch (err: any) {
              return {
                realFile,
                error: err?.message ?? "Unknown error",
                status: "error",
              };
            }
          })
        );

        results.push(
          ...batchResults.map((r) =>
            r.status === "fulfilled"
              ? r.value
              : { status: "failed", error: r.reason?.message }
          )
        );

        // 💤 구글 API rate limit 방지를 위한 약간의 대기 (선택)
        await new Promise((r) => setTimeout(r, 300));
      }

      res.json({ results });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

export default router;
