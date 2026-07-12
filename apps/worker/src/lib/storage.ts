/**
 * Storage helper — wraps Supabase Storage for image/file uploads.
 *
 * Used for:
 *  - Branch logos
 *  - Product images
 *  - Repair inspection photos
 *
 * Bucket: 'public-assets' (public read, authenticated write).
 */
import { AppError, ERROR_CODES } from '@mobile-shop/shared';
import type { LooseSupabaseClient } from './supabase';

const PUBLIC_BUCKET = 'public-assets';

export interface UploadResult {
  url: string;
  path: string;
  size: number;
  mimeType: string;
}

/** Upload a base64-encoded image to public-assets bucket. */
export async function uploadImageBase64(
  supabase: LooseSupabaseClient,
  input: {
    base64: string; // data URL: "data:image/png;base64,..."
    folder: string; // e.g. "logos", "products", "repairs"
    filename: string; // e.g. "branch-001.png"
  },
): Promise<UploadResult> {
  const matches = input.base64.match(/^data:(image\/[a-z]+);base64,(.+)$/i);
  if (!matches || matches.length !== 3) {
    throw new AppError(ERROR_CODES.INVALID_PAYLOAD, 'صيغة الصورة غير صحيحة. متوقع data:image/...;base64,...');
  }

  const mimeType = matches[1]!;
  const base64Data = matches[2]!;
  const bytes = base64Decode(base64Data);
  const size = bytes.length;

  // Validate size (max 2MB).
  if (size > 2 * 1024 * 1024) {
    throw new AppError(ERROR_CODES.INVALID_PAYLOAD, 'حجم الصورة يجب ألا يتجاوز 2 ميجابايت');
  }

  const path = `${input.folder}/${input.filename}`;
  const { error } = await supabase.storage
    .from(PUBLIC_BUCKET)
    .upload(path, bytes, {
      contentType: mimeType,
      upsert: true,
    });

  if (error) {
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, `فشل رفع الصورة: ${error.message}`);
  }

  const { data: pub } = supabase.storage.from(PUBLIC_BUCKET).getPublicUrl(path);

  return {
    url: pub.publicUrl,
    path,
    size,
    mimeType,
  };
}

/** Delete an asset by path. */
export async function deleteAsset(
  supabase: LooseSupabaseClient,
  path: string,
): Promise<void> {
  const { error } = await supabase.storage.from(PUBLIC_BUCKET).remove([path]);
  if (error) {
    console.error('Failed to delete asset:', error);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────

function base64Decode(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
