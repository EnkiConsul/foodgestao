import { supabase } from "@/integrations/supabase/client";

const BUCKET = "transaction-attachments";

/**
 * Extract the storage path from a file_url that may be either:
 * - a raw storage path (e.g. "<uid>/<txnid>/file.png")
 * - a legacy public URL (e.g. "https://.../object/public/transaction-attachments/<path>")
 * - a signed URL (e.g. "https://.../object/sign/transaction-attachments/<path>?token=...")
 */
export function extractStoragePath(fileUrl: string): string {
  if (!fileUrl) return fileUrl;
  if (!/^https?:\/\//i.test(fileUrl)) return fileUrl;
  const markers = [
    `/object/public/${BUCKET}/`,
    `/object/sign/${BUCKET}/`,
    `/${BUCKET}/`,
  ];
  for (const m of markers) {
    const idx = fileUrl.indexOf(m);
    if (idx !== -1) {
      const pathWithQuery = fileUrl.substring(idx + m.length);
      return pathWithQuery.split("?")[0];
    }
  }
  return fileUrl;
}

/**
 * Resolve a stored file_url (path or legacy URL) into a short-lived signed URL.
 */
export async function getSignedAttachmentUrl(fileUrl: string, expiresIn = 3600): Promise<string> {
  const path = extractStoragePath(fileUrl);
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) return fileUrl;
  return data.signedUrl;
}

export async function resolveAttachments<T extends { file_url: string }>(items: T[]): Promise<T[]> {
  return Promise.all(
    items.map(async (item) => ({ ...item, file_url: await getSignedAttachmentUrl(item.file_url) })),
  );
}
