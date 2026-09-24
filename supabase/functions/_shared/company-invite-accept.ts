// Aplica um grupo de convites (uma ou mais empresas) a um usuário.
// deno-lint-ignore-file no-explicit-any
export async function aplicarGrupoConvite(admin: any, grupoId: string, userId: string) {
  const { data: convites } = await admin
    .from("company_invites")
    .select("id, company_id, role, perfil, permissions, modulos, ver_saldos, ver_salarios, contas_permitidas, expires_at, companies(name)")
    .eq("grupo_id", grupoId)
    .eq("status", "pending");

  const nomes: string[] = [];
  for (const c of convites ?? []) {
    if (new Date(c.expires_at) < new Date()) {
      await admin.from("company_invites").update({ status: "expired" }).eq("id", c.id);
      continue;
    }
    const { data: existing } = await admin
      .from("company_members").select("id").eq("company_id", c.company_id).eq("user_id", userId).maybeSingle();
    if (!existing) {
      const { error } = await admin.from("company_members").insert({
        company_id: c.company_id,
        user_id: userId,
        role: c.role,
        perfil: c.perfil ?? "personalizado",
        permissions: c.permissions ?? {},
        modulos: c.modulos ?? { financeiro: true, pessoas: true, conta: true },
        ver_saldos: c.ver_saldos ?? true,
        ver_salarios: c.ver_salarios ?? true,
        contas_permitidas: c.contas_permitidas ?? null,
      });
      if (error) throw new Error(error.message);
    }
    await admin.from("company_invites").update({ status: "accepted" }).eq("id", c.id);
    if (c.companies?.name) nomes.push(c.companies.name);
  }
  return nomes;
}

export const WA_EMAIL_DOMAIN = "usuarios.aveto360.local";
export const waEmail = (digits: string) => `wa${digits}@${WA_EMAIL_DOMAIN}`;
