import { google } from "googleapis";

const auth = new google.auth.GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/drive"],
});

const drive = google.drive({ version: "v3", auth });

//1. 폴더 id로 파일 리스트 조회
export async function listFilesInFolder(
    folderId : string
) : Promise<Array<{ id : string; name : string }>> {
    const driveId = process.env.GOOGLE_SHARED_DRIVE_ID;
    const res = await drive.files.list({
        q : `'${folderId}' in parents and trashed = false`,
        fields : 'files(id, name, mimeType, parents)',
        corpora : "drive",
        driveId,
        supportsAllDrives : true, // 공유 드라이브 지원
        includeItemsFromAllDrives : true, // 공유 드라이브 파일 포함
    });

    const files = res.data.files ?? [];

    return files
        .filter( (file) => file.id && file.name)
        .map( (file) => ({
            id : file.id!,
            name : file.name!,
        }));
}

//2. 전체 파일 JSON 중 특정 이름의 파일을 찾아 반환
export function findFileObject(
    files : Array<{id:string; name:string;}>,
    fileName : string
) {
    return files.find((file) => file.name === fileName);
}

//3. 파일 복제 후 이동시키기
export async function copyFileToFolder(
    fileId : string,
    targetFolderId : string,
    newName : string
) {
    const driveId = process.env.GOOGLE_SHARED_DRIVE_ID;
    // 1) 타겟 폴더에 동일한 이름의 파일이 있는지 검사
    const existingFile = await drive.files.list({
        q : `'${targetFolderId}' in parents and name = '${newName}' and trashed = false`,
        fields : "files(id, name)",
        corpora : "drive",
        driveId,
        supportsAllDrives : true,
        includeItemsFromAllDrives : true,
    });

    //2) 존재하면 모두 삭제 (Drive는 자동 overwrite 없음)
    const existingFiles = existingFile.data.files ?? [];
    for(const f of existingFiles) {
        await drive.files.delete({
            fileId : f.id!,
            supportsAllDrives : true,
        });
    }

    // 3) 파일 복제 및 이동
    const copyRes = await drive.files.copy({
        fileId,
        requestBody : {
            name : newName,
            parents : [targetFolderId],
        },
        supportsAllDrives : true,
    });

    return copyRes.data;
}