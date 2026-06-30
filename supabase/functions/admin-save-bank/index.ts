import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

const LogoUrlSchema = z
  .string()
  .trim()
  .max(500, "URL muito longa (máx. 500 caracteres)")
  .url("URL inválida — use o formato https://...")
  .refine((v) => /^https?:\/\//i.test(v), "A URL deve começar com http:// ou https://")
  .refine(
    (v) => /\.(png|jpe?g|svg|webp|gif|avif)(\?.*)?$/i.test(v),
    "A URL deve apontar para uma imagem (.png, .jpg, .svg, .webp, .gif, .avif)",
  );

const SlugSchema = z
  .string()
  .trim()
  .min(1, "Slug obrigatório")
  .max(50, "Slug muito longo")
  .regex(/^[a-z0-9-]+$/, "Slug deve conter apenas letras minúsculas, números e hífens");

const BaseSchema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório").max(80, "Nome muito longo"),
  domain: z.preprocess(
    (v) => {
      if (typeof v !== "string") return v ?? null;
      const t = v.trim();
      return t === "" ? null : t;
    },
    z
      .string()
      .max(120, "Domínio muito longo")
      .regex(
        /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i,
        "Domínio inválido (ex: nubank.com.br)",
      )
      .nullable()
      .optional(),
  ),
  logo_url: z.preprocess(
    (v) => {
      if (typeof v !== "string") return v ?? null;
      return v.trim() === "" ? null : v.trim();
    },
    LogoUrlSchema.nullable().optional(),
  ),
  sort_order: z.number().int().min(0).max(100000).optional(),
  is_active: z.boolean().optional(),
});

const CreateSchema = BaseSchema.extend({
  action: z.literal("create"),
  slug: SlugSchema,
});

const UpdateSchema = BaseSchema.extend({
  action: z.literal("update"),
  id: z.string().uuid(),
});

const BodySchema = z.discriminatedUnion("action", [CreateSchema, UpdateSchema]);

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeNullable<T>(v: T | null | undefined): T | null {
  if (v === undefined) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  return v as T;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const auth = req.headers.get("Authorization") ?? "";

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: isSuper } = await admin.rpc("is_super_admin", { _user_id: u.user.id });
    if (!isSuper) return json({ error: "Forbidden" }, 403);

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
    }

    const body = parsed.data;
    const payload = {
      name: body.name.trim(),
      domain: normalizeNullable(body.domain),
      logo_url: normalizeNullable(body.logo_url),
      sort_order: body.sort_order ?? 100,
      is_active: body.is_active ?? true,
    };

    if (body.action === "create") {
      const { data, error } = await admin
        .from("banks")
        .insert({ ...payload, slug: body.slug })
        .select()
        .single();
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, bank: data });
    }

    const { data, error } = await admin
      .from("banks")
      .update(payload)
      .eq("id", body.id)
      .select()
      .single();
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, bank: data });
  } catch (e) {
    console.error("[admin-save-bank] error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
