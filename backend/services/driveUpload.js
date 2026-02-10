import { Readable } from "stream";
import { google } from "googleapis";
import { getGoogleJwtClient } from "./googleAuth.js";

const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.file"];

/**
 * Upload a void-label screenshot image to Google Drive and return a shareable URL.
 *
 * Files are always uploaded into a folder named "Label_Voided_Images"
 * in the Drive of SERVICE_EMAIL (via service account impersonation).
 * If the folder doesn't exist, it will be created.
 */
export async function uploadVoidLabelScreenshotToDrive(buffer, mimeType, fileName) {
  if (!buffer || !buffer.length) {
    throw new Error("No file data provided");
  }

  const auth = getGoogleJwtClient(DRIVE_SCOPES);
  const drive = google.drive({ version: "v3", auth });

  // Ensure the Label_Voided_Images folder exists
  const folderName = "Label_Voided_Images";
  let folderId;

  // Try to find existing folder
  const listRes = await drive.files.list({
    q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id, name)",
    pageSize: 1,
  });

  if (listRes.data.files && listRes.data.files.length > 0) {
    folderId = listRes.data.files[0].id;
  } else {
    // Create folder if it doesn't exist
    const folderRes = await drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
      },
      fields: "id",
    });
    folderId = folderRes.data.id;
  }

  const fileMetadata = {
    name: fileName,
    parents: folderId ? [folderId] : undefined,
  };

  const media = {
    mimeType,
    body: Readable.from(buffer),
  };

  const createRes = await drive.files.create({
    requestBody: fileMetadata,
    media,
    fields: "id, webViewLink, webContentLink",
  });

  const file = createRes.data;
  if (!file.id) {
    throw new Error("Failed to upload file to Drive (no id returned)");
  }

  // Make the file viewable by link
  try {
    await drive.permissions.create({
      fileId: file.id,
      requestBody: {
        role: "reader",
        type: "anyone",
      },
    });
  } catch (err) {
    // Log but don't fail the whole operation if permission update fails
    console.warn("[driveUpload] Failed to update file permissions:", err?.message || err);
  }

  // Prefer Google's webViewLink or webContentLink if present
  if (file.webViewLink) return file.webViewLink;
  if (file.webContentLink) return file.webContentLink;

  // Fallback to standard view URL
  return `https://drive.google.com/file/d/${file.id}/view`;
}

