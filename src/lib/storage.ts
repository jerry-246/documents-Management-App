import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only helper around Supabase Storage. Uses the service-role key so uploads
// bypass row-level security; never import this from a client component.
let client: SupabaseClient | null = null;

export function storageConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function storageBucket(): string {
  return process.env.SUPABASE_STORAGE_BUCKET || "documents";
}

function getClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("File storage is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, then create a Storage bucket.");
  }
  if (!client) client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

export async function uploadObject(path: string, data: Buffer, contentType: string): Promise<void> {
  const { error } = await getClient()
    .storage.from(storageBucket())
    .upload(path, data, { contentType, upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);
}

export async function createDownloadUrl(path: string, expiresIn = 60 * 10): Promise<string> {
  const { data, error } = await getClient().storage.from(storageBucket()).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) throw new Error(`Could not create download link: ${error?.message ?? "unknown error"}`);
  return data.signedUrl;
}

export async function removeObject(path: string): Promise<void> {
  const { error } = await getClient().storage.from(storageBucket()).remove([path]);
  if (error) throw new Error(`Delete failed: ${error.message}`);
}
