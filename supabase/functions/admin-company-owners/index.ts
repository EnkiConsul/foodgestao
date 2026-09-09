/**
 * Backoffice: gestão dos donos de cada empresa.
 *
 * Ações (somente super admin):
 *  - list            → empresas com titular, demais donos e assinatura do titular
 *  - add_owner       → promove um usuário existente a dono
 *  - remove_owner    → retira o papel de dono (nunca o titular, nunca o último)
 *  - transfer_owner  → troca o titular (quem paga) da empresa
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { jsonError, jsonResponse, strictCorsHeaders } from "../_shared/http.ts";

const BodySchema = z.union([
  z.object({ action: z.literal("list") }),
  z.object({
    action: z.literal("add_owner"),
    companyId: z.string().uuid(),
    email: z.string().email().max(255),
  }),
  z.object({
    action: z.literal("remove_owner"),
    companyId: z.string().uuid(),
    userId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("transfer_owner"),
    companyId: z.string().uuid(),
    userId: z.string().uuid(),
  }),
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: strictCorsHeaders(req) });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonError(req, "unauthorized");
    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) return jsonError(req, "unauthorized");

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    });

    let callerId: string | null = null;
    const authApi = admin.auth as unknown as {
      getClaims?: (t: string) => Promise<{ data?: { claims?: { sub?: string } } }>;
    };
    if (typeof authApi.getClaims === "function") {
      const { data } = await authApi.getClaims(token);
      callerId = data?.claims?.sub ?? null;
    }
    if (!callerId) {
      const { data } = await admin.auth.getUser(token);
      callerId = data?.user?.id ?? null;
    }
    if (!callerId) return jsonError(req, "unauthorized");

    const { data: isSuper, error: roleErr } = await admin.rpc("is_super_admin", {
      _user_id: callerId,
    });
    if (roleErr || !isSuper) return jsonError(req, "forbidden", roleErr);

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return jsonError(req, "invalid_input", parsed.error.flatten());
    const body = parsed.data;

    /** Mapa user_id → e-mail/telefone do auth. */
    async function authUsers(): Promise<Map<string, { email: string | null; phone: string | null }>> {
      const map = new Map<string, { email: string | null; phone: string | null }>();
      let page = 1;
      const perPage = 1000;
      while (page <= 20) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
        if (error) throw error;
        for (const u of data.users) {
          map.set(u.id, { email: u.email ?? null, phone: u.phone ?? null });
        }
        if (data.users.length < perPage) break;
        page++;
      }
      return map;
    }

    async function audit(action: string, companyId: string, details: Record<string, unknown>) {
      await admin.from("audit_logs").insert({
        user_id: callerId,
        action,
        entity_type: "company",
        entity_id: companyId,
        details,
      });
    }

    if (body.action === "list") {
      const [{ data: companies, error: cErr }, { data: members, error: mErr }, { data: profiles, error: pErr }, { data: subs, error: sErr }] =
        await Promise.all([
          admin
            .from("companies")
            .select("id, name, trade_name, cnpj, is_active, profile_type, user_id, created_at")
            .order("created_at", { ascending: false }),
          admin.from("company_members").select("company_id, user_id, role").eq("role", "owner"),
          admin.from("profiles").select("user_id, full_name, phone"),
          admin
            .from("subscriptions")
            .select("user_id, status, is_exempt, exempt_until, trial_ends_at, current_period_end, plan:plans(name)")
            .order("created_at", { ascending: false }),
        ]);
      if (cErr || mErr || pErr || sErr) return jsonError(req, "internal", cErr ?? mErr ?? pErr ?? sErr);

      const emails = await authUsers();
      const profileMap = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));
      const subMap = new Map<string, any>();
      for (const s of (subs ?? []) as any[]) if (!subMap.has(s.user_id)) subMap.set(s.user_id, s);

      const person = (userId: string | null) => {
        if (!userId) return null;
        const p = profileMap.get(userId) as any;
        const a = emails.get(userId);
        return {
          userId,
          fullName: p?.full_name ?? null,
          phone: p?.phone ?? a?.phone ?? null,
          email: a?.email ?? null,
          hasAccount: !!a || !!p,
        };
      };

      const ownersByCompany = new Map<string, string[]>();
      for (const m of (members ?? []) as any[]) {
        const list = ownersByCompany.get(m.company_id) ?? [];
        list.push(m.user_id);
        ownersByCompany.set(m.company_id, list);
      }

      const rows = (companies ?? []).map((c: any) => {
        const ownerIds = ownersByCompany.get(c.id) ?? [];
        const sub = subMap.get(c.user_id) ?? null;
        return {
          companyId: c.id,
          name: c.name,
          tradeName: c.trade_name,
          cnpj: c.cnpj,
          isActive: c.is_active,
          createdAt: c.created_at,
          holder: person(c.user_id),
          owners: ownerIds.map((id) => person(id)).filter(Boolean),
          holderIsOwner: ownerIds.includes(c.user_id),
          subscription: sub
            ? {
                status: sub.status,
                isExempt: sub.is_exempt,
                exemptUntil: sub.exempt_until,
                trialEndsAt: sub.trial_ends_at,
                currentPeriodEnd: sub.current_period_end,
                planName: sub.plan?.name ?? null,
              }
            : null,
        };
      });

      return jsonResponse(req, 200, { companies: rows });
    }

    // Ações de escrita
    const { data: company, error: compErr } = await admin
      .from("companies")
      .select("id, name, user_id")
      .eq("id", body.companyId)
      .maybeSingle();
    if (compErr) return jsonError(req, "internal", compErr);
    if (!company) return jsonError(req, "not_found");

    if (body.action === "add_owner") {
      const emails = await authUsers();
      let targetId: string | null = null;
      const wanted = body.email.trim().toLowerCase();
      for (const [id, info] of emails) {
        if ((info.email ?? "").toLowerCase() === wanted) {
          targetId = id;
          break;
        }
      }
      if (!targetId) {
        return jsonResponse(req, 404, { error: "Nenhum usuário cadastrado com este e-mail." });
      }

      const { error: upErr } = await admin
        .from("company_members")
        .upsert(
          { company_id: company.id, user_id: targetId, role: "owner" },
          { onConflict: "company_id,user_id" },
        );
      if (upErr) return jsonError(req, "internal", upErr);
      await audit("company_owner_added", company.id, { target_user_id: targetId, email: wanted });
      return jsonResponse(req, 200, { ok: true });
    }

    const { data: owners, error: ownErr } = await admin
      .from("company_members")
      .select("user_id")
      .eq("company_id", company.id)
      .eq("role", "owner");
    if (ownErr) return jsonError(req, "internal", ownErr);
    const ownerIds = (owners ?? []).map((o: any) => o.user_id as string);

    if (body.action === "remove_owner") {
      if (body.userId === company.user_id) {
        return jsonResponse(req, 409, {
          error: "Este usuário é o titular da empresa. Transfira a titularidade antes de remover.",
        });
      }
      if (ownerIds.length <= 1) {
        return jsonResponse(req, 409, { error: "A empresa precisa ter ao menos um dono." });
      }
      const { error: delErr } = await admin
        .from("company_members")
        .delete()
        .eq("company_id", company.id)
        .eq("user_id", body.userId)
        .eq("role", "owner");
      if (delErr) return jsonError(req, "internal", delErr);
      await audit("company_owner_removed", company.id, { target_user_id: body.userId });
      return jsonResponse(req, 200, { ok: true });
    }

    // transfer_owner
    if (body.userId === company.user_id) {
      return jsonResponse(req, 409, { error: "Este usuário já é o titular da empresa." });
    }
    if (!ownerIds.includes(body.userId)) {
      const { error: upErr } = await admin
        .from("company_members")
        .upsert(
          { company_id: company.id, user_id: body.userId, role: "owner" },
          { onConflict: "company_id,user_id" },
        );
      if (upErr) return jsonError(req, "internal", upErr);
    }
    const { error: tErr } = await admin
      .from("companies")
      .update({ user_id: body.userId })
      .eq("id", company.id);
    if (tErr) return jsonError(req, "internal", tErr);
    await audit("company_holder_transferred", company.id, {
      previous_user_id: company.user_id,
      new_user_id: body.userId,
    });
    return jsonResponse(req, 200, { ok: true });
  } catch (e) {
    return jsonError(req, "internal", e);
  }
});
