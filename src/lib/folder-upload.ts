import { supabase } from "@/integrations/supabase/client";
import { uploadResumable } from "@/lib/resumable-upload";

const BUCKET = "folder-files";
const RESUMABLE_THRESHOLD = 6 * 1024 * 1024; // 6 MB

interface UploadFileToFolderOpts {
  folderId: string;
  file: File;
  /** 0–100 progress for the current file. */
  onProgress?: (pct: number) => void;
  /** Receives a cancel handle as soon as the (resumable) upload starts. */
  onStart?: (cancel: () => void) => void;
}

/**
 * Upload a single file into a folder. Picks the standard upload for small
 * files and the TUS resumable upload (with progress + cancel) for large ones.
 * Inserts the matching `folder_files` row on success. Throws on failure;
 * throws Error("cancelled") if the upload is aborted.
 */
export async function uploadFileToFolder({
  folderId,
  file,
  onProgress,
  onStart,
}: UploadFileToFolderOpts): Promise<void> {
  const safeName = file.name.replace(/[^\w.\-]/g, "_");
  const path = `${folderId}/${crypto.randomUUID()}-${safeName}`;

  if (file.size > RESUMABLE_THRESHOLD) {
    await uploadResumable({
      file,
      path,
      onProgress: (pct) => onProgress?.(pct),
      onStart,
    });
  } else {
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (error) throw error;
    onProgress?.(100);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error: insErr } = await supabase.from("folder_files").insert({
    folder_id: folderId,
    storage_path: path,
    file_name: file.name,
    size_bytes: file.size,
    mime_type: file.type || undefined,
    uploaded_by: user?.id ?? undefined,
  });
  if (insErr) throw insErr;
}
