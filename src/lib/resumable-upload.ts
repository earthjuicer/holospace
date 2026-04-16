import * as tus from "tus-js-client";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "folder-files";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

interface ResumableUploadOptions {
  file: File;
  path: string;
  onProgress: (pct: number) => void;
}

/**
 * Resumable upload using TUS protocol — required for files larger than ~50 MB
 * because the standard Supabase storage upload uses a single multipart POST
 * that's capped at the platform's edge body limit.
 */
export async function uploadResumable({
  file,
  path,
  onProgress,
}: ResumableUploadOptions): Promise<void> {
  const { data: sess } = await supabase.auth.getSession();
  const accessToken =
    sess.session?.access_token ??
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string);

  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-upsert": "false",
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: BUCKET,
        objectName: path,
        contentType: file.type || "application/octet-stream",
        cacheControl: "3600",
      },
      chunkSize: 6 * 1024 * 1024, // Required: 6 MB chunks for Supabase TUS
      onError: (err) => reject(err),
      onProgress: (sent, total) => {
        onProgress(Math.round((sent / total) * 100));
      },
      onSuccess: () => resolve(),
    });

    // Pick up where we left off if a previous attempt was interrupted
    upload.findPreviousUploads().then((prev) => {
      if (prev.length) upload.resumeFromPreviousUpload(prev[0]);
      upload.start();
    });
  });
}
