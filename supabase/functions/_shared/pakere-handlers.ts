// Handlers de importação por entidade (Pakere → 360°FOOD DP).
// Cada handler é isolado. Assumimos que a Pakere expõe as tabelas dp_unidades,
// dp_cargos e dp_colaboradores com o mesmo schema-base do 360°FOOD (o portal
// original derivou do mesmo template). Em `dry_run` só contamos e validamos.

import {
  HandlerContext,
  HandlerResult,
  ImportModule,
  normalizeCpf,
  normalizeEmail,
  normalizePhone,
  resolveMappedId,
  saveMap,
} from "./pakere-import.ts";

async function paginate<T>(
  fetcher: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>,
  batchSize: number,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  // Safety cap para evitar loops infinitos: 500 páginas.
  for (let i = 0; i < 500; i++) {
    const to = from + batchSize - 1;
    const { data, error } = await fetcher(from, to);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < batchSize) break;
    from += batchSize;
  }
  return all;
}

export async function importUnidades(ctx: HandlerContext): Promise<HandlerResult> {
  const entity: ImportModule = "unidades";
  const rows = await paginate<Record<string, unknown>>(
    (from, to) =>
      ctx.pakere.from("dp_unidades").select("*").range(from, to).order("created_at", { ascending: true }),
    ctx.batchSize,
  );
  await ctx.logger.log(entity, "info", `Origem retornou ${rows.length} unidades`);
  let dest = 0;
  let errors = 0;
  for (const r of rows) {
    const sourceId = String(r.id);
    const existing = await resolveMappedId(ctx.admin, ctx.companyId, entity, sourceId);
    if (existing) continue;
    if (ctx.dryRun) {
      dest += 1;
      continue;
    }
    const payload = {
      company_id: ctx.companyId,
      nome: String(r.nome ?? "Unidade sem nome"),
      cnpj: (r.cnpj as string) ?? null,
      endereco: (r.endereco as string) ?? null,
      cidade: (r.cidade as string) ?? null,
      uf: (r.uf as string) ?? null,
      telefone: (r.telefone as string) ?? null,
      ativo: r.ativo === false ? false : true,
    };
    const { data, error } = await ctx.admin
      .from("dp_unidades")
      .insert(payload)
      .select("id")
      .single();
    if (error || !data) {
      errors += 1;
      await ctx.logger.log(entity, "error", `Falha ao inserir unidade ${sourceId}`, { error: error?.message });
      continue;
    }
    await saveMap(ctx.admin, ctx.runId, ctx.companyId, entity, sourceId, data.id);
    dest += 1;
  }
  return {
    entity,
    sourceCount: rows.length,
    destCount: dest,
    skipped: rows.length - dest - errors,
    errors,
    status: errors > 0 ? "failed" : "success",
  };
}

export async function importCargos(ctx: HandlerContext): Promise<HandlerResult> {
  const entity: ImportModule = "cargos";
  const rows = await paginate<Record<string, unknown>>(
    (from, to) =>
      ctx.pakere.from("dp_cargos").select("*").range(from, to).order("created_at", { ascending: true }),
    ctx.batchSize,
  );
  await ctx.logger.log(entity, "info", `Origem retornou ${rows.length} cargos`);
  let dest = 0;
  let errors = 0;
  for (const r of rows) {
    const sourceId = String(r.id);
    const existing = await resolveMappedId(ctx.admin, ctx.companyId, entity, sourceId);
    if (existing) continue;
    if (ctx.dryRun) {
      dest += 1;
      continue;
    }
    const payload = {
      company_id: ctx.companyId,
      nome: String(r.nome ?? "Cargo sem nome"),
      cbo: (r.cbo as string) ?? null,
      salario_base: (r.salario_base as number) ?? null,
      descricao: (r.descricao as string) ?? null,
      ativo: r.ativo === false ? false : true,
    };
    const { data, error } = await ctx.admin
      .from("dp_cargos")
      .insert(payload)
      .select("id")
      .single();
    if (error || !data) {
      errors += 1;
      await ctx.logger.log(entity, "error", `Falha ao inserir cargo ${sourceId}`, { error: error?.message });
      continue;
    }
    await saveMap(ctx.admin, ctx.runId, ctx.companyId, entity, sourceId, data.id);
    dest += 1;
  }
  return {
    entity,
    sourceCount: rows.length,
    destCount: dest,
    skipped: rows.length - dest - errors,
    errors,
    status: errors > 0 ? "failed" : "success",
  };
}

export async function importColaboradores(ctx: HandlerContext): Promise<HandlerResult> {
  const entity: ImportModule = "colaboradores";
  const rows = await paginate<Record<string, unknown>>(
    (from, to) =>
      ctx.pakere.from("dp_colaboradores").select("*").range(from, to).order("created_at", { ascending: true }),
    ctx.batchSize,
  );
  await ctx.logger.log(entity, "info", `Origem retornou ${rows.length} colaboradores`);
  let dest = 0;
  let errors = 0;
  let skipped = 0;

  // CPFs já existentes na empresa (evita duplicar registros preexistentes)
  const { data: existingCpfsRows } = await ctx.admin
    .from("dp_colaboradores")
    .select("cpf")
    .eq("company_id", ctx.companyId)
    .not("cpf", "is", null);
  const existingCpfs = new Set(
    (existingCpfsRows ?? []).map((r) => normalizeCpf(r.cpf as string)).filter((v): v is string => !!v),
  );

  for (const r of rows) {
    const sourceId = String(r.id);
    const existing = await resolveMappedId(ctx.admin, ctx.companyId, entity, sourceId);
    if (existing) continue;

    const cpf = normalizeCpf(r.cpf as string);
    if (cpf && existingCpfs.has(cpf)) {
      skipped += 1;
      await ctx.logger.log(entity, "warn", `CPF já existe no destino, colaborador ignorado`, {
        sourceId,
        cpf: cpf.slice(0, 3) + "***",
      });
      continue;
    }

    const unidadeSrc = r.unidade_id ? String(r.unidade_id) : null;
    const cargoSrc = r.cargo_id ? String(r.cargo_id) : null;
    const unidadeDest = unidadeSrc
      ? await resolveMappedId(ctx.admin, ctx.companyId, "unidades", unidadeSrc)
      : null;
    const cargoDest = cargoSrc
      ? await resolveMappedId(ctx.admin, ctx.companyId, "cargos", cargoSrc)
      : null;

    if (unidadeSrc && !unidadeDest) {
      await ctx.logger.log(entity, "warn", `FK unidade não mapeada`, { sourceId, unidadeSrc });
    }
    if (cargoSrc && !cargoDest) {
      await ctx.logger.log(entity, "warn", `FK cargo não mapeada`, { sourceId, cargoSrc });
    }

    if (ctx.dryRun) {
      dest += 1;
      continue;
    }

    const payload: Record<string, unknown> = {
      company_id: ctx.companyId,
      user_id: null, // portal exige convite explícito depois
      nome: String(r.nome ?? "Sem nome"),
      cpf,
      matricula: (r.matricula as string) ?? null,
      cargo: (r.cargo as string) ?? null,
      regime: (r.regime as string) ?? "clt",
      data_admissao: (r.data_admissao as string) ?? null,
      data_desligamento: (r.data_desligamento as string) ?? null,
      email: normalizeEmail(r.email as string),
      email_portal: normalizeEmail(r.email_portal as string),
      email_contato: normalizeEmail(r.email_contato as string),
      telefone: normalizePhone(r.telefone as string),
      whatsapp: normalizePhone(r.whatsapp as string),
      ativo: r.ativo === false ? false : true,
      observacoes: (r.observacoes as string) ?? null,
      unidade_id: unidadeDest,
      cargo_id: cargoDest,
      sindicato_id: null,
      dp_permissions: (r.dp_permissions as unknown) ?? {},
      data_nascimento: (r.data_nascimento as string) ?? null,
      folga_fixa_semana: (r.folga_fixa_semana as number) ?? null,
      perfil_acesso: (r.perfil_acesso as string) ?? "colaborador",
      possui_folha_ponto: r.possui_folha_ponto === true,
      optante_adiantamento: r.optante_adiantamento === true,
      endereco: (r.endereco as unknown) ?? null,
      aprovacao_status: "aprovado",
    };

    const { data, error } = await ctx.admin
      .from("dp_colaboradores")
      .insert(payload)
      .select("id")
      .single();
    if (error || !data) {
      errors += 1;
      await ctx.logger.log(entity, "error", `Falha ao inserir colaborador ${sourceId}`, {
        error: error?.message,
      });
      continue;
    }
    await saveMap(ctx.admin, ctx.runId, ctx.companyId, entity, sourceId, data.id);
    if (cpf) existingCpfs.add(cpf);
    dest += 1;
  }

  return {
    entity,
    sourceCount: rows.length,
    destCount: dest,
    skipped,
    errors,
    status: errors > 0 ? "failed" : "success",
  };
}

export function notImplemented(entity: ImportModule): HandlerResult {
  return {
    entity,
    sourceCount: 0,
    destCount: 0,
    skipped: 0,
    errors: 0,
    status: "skipped",
    details: { reason: "not_implemented_yet" },
  };
}
