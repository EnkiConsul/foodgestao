// Utilitários compartilhados para a importação Pakere → DP.
// Fica no _shared para ser reaproveitado pelo import e pelo rollback.

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function getAdminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export function getPakereClient(): SupabaseClient {
  const url = Deno.env.get("PAKERE_SUPABASE_URL");
  const key = Deno.env.get("PAKERE_SUPABASE_SECRET_KEY");
  if (!url || !key) {
    throw new Error("PAKERE_SUPABASE_URL/PAKERE_SUPABASE_SECRET_KEY não configurados");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function requireSuperAdmin(req: Request): Promise<
  | { ok: true; userId: string }
  | { ok: false; response: Response }
> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) {
    return { ok: false, response: json({ error: "Unauthorized" }, 401) };
  }
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );
  const { data, error } = await userClient.auth.getClaims(auth.replace("Bearer ", ""));
  if (error || !data?.claims?.sub) {
    return { ok: false, response: json({ error: "Unauthorized" }, 401) };
  }
  const userId = data.claims.sub as string;
  const admin = getAdminClient();
  const { data: isSuper, error: rpcErr } = await admin.rpc("is_super_admin", { _user_id: userId });
  if (rpcErr || !isSuper) {
    return { ok: false, response: json({ error: "Forbidden" }, 403) };
  }
  return { ok: true, userId };
}

export function onlyDigits(s: string | null | undefined): string | null {
  if (!s) return null;
  const v = s.replace(/\D+/g, "");
  return v.length ? v : null;
}

export function normalizeEmail(s: string | null | undefined): string | null {
  if (!s) return null;
  const v = s.trim().toLowerCase();
  return v.length ? v : null;
}

export function normalizePhone(s: string | null | undefined): string | null {
  return onlyDigits(s);
}

export function normalizeCpf(s: string | null | undefined): string | null {
  const v = onlyDigits(s);
  if (!v || v.length !== 11) return null;
  return v;
}

export interface RunLogger {
  log(entity: string, level: "info" | "warn" | "error", message: string, context?: unknown): Promise<void>;
}

export function makeLogger(admin: SupabaseClient, runId: string): RunLogger {
  return {
    async log(entity, level, message, context) {
      await admin.from("dp_import_logs").insert({
        run_id: runId,
        entity,
        level,
        message,
        context: context ?? {},
      });
    },
  };
}

export async function resolveMappedId(
  admin: SupabaseClient,
  companyId: string,
  entity: string,
  sourceId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("dp_import_id_map")
    .select("dest_id")
    .eq("company_id", companyId)
    .eq("entity", entity)
    .eq("source_id", sourceId)
    .maybeSingle();
  return data?.dest_id ?? null;
}

export async function saveMap(
  admin: SupabaseClient,
  runId: string,
  companyId: string,
  entity: string,
  sourceId: string,
  destId: string,
): Promise<void> {
  await admin.from("dp_import_id_map").upsert(
    { run_id: runId, company_id: companyId, entity, source_id: sourceId, dest_id: destId },
    { onConflict: "company_id,entity,source_id" },
  );
}

export const SUPPORTED_MODULES = [
  "unidades",
  "cargos",
  "colaboradores",
  "sindicatos",
  "folgas",
  "solicitacoes",
  "atestados",
  "trocas",
  "disciplinares",
  "avisos",
  "mensagens",
  "notificacoes",
  "documentos",
] as const;

export type ImportModule = (typeof SUPPORTED_MODULES)[number];

export const IMPLEMENTED_MODULES: ReadonlySet<ImportModule> = new Set([
  "unidades",
  "cargos",
  "colaboradores",
]);

export interface HandlerContext {
  admin: SupabaseClient;
  pakere: SupabaseClient;
  companyId: string;
  runId: string;
  dryRun: boolean;
  batchSize: number;
  logger: RunLogger;
}

export interface HandlerResult {
  entity: ImportModule;
  sourceCount: number;
  destCount: number;
  skipped: number;
  errors: number;
  status: "success" | "skipped" | "failed";
  details?: Record<string, unknown>;
}
