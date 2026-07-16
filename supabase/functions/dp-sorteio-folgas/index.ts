// Edge function: dp-sorteio-folgas
// Sorteia folgas de fim de semana para todos os colaboradores ativos
// de uma empresa em um determinado mês, respeitando:
//   - dp_dia_config.limite_folgas (por dia / opcionalmente por unidade)
//   - dp_prioridade_aniversario (aniversariantes primeiro)
//   - dp_datas_bloqueadas + dp_bloqueios (validados no trigger)
//   - dp_folgas já existentes (não sorteia colaborador que já tem folga no fim de semana)
//
// Body: { company_id: string, ano: number, mes: number, regenerar_prioridades?: boolean, dias?: number[] (0=dom..6=sab, default [0,6]) }
// Retorna: { inseridas: number, ignoradas: Array<{ data, colaborador_id, motivo }>, prioridades_geradas: number }

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

const BodySchema = z.object({
  company_id: z.string().uuid(),
  ano: z.number().int().min(2000).max(2100),
  mes: z.number().int().min(1).max(12),
  regenerar_prioridades: z.boolean().optional().default(true),
  dias: z.array(z.number().int().min(0).max(6)).optional().default([0, 6]),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return json({ error: parsed.error.flatten().fieldErrors }, 400);
    }
    const { company_id, ano, mes, regenerar_prioridades, dias } = parsed.data;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // 1) (Re)gerar fila de prioridade do mês, se solicitado
    let prioridades_geradas = 0;
    if (regenerar_prioridades) {
      const { data, error } = await supabase.rpc("dp_gerar_prioridades_aniversario", {
        _company_id: company_id, _ano: ano, _mes: mes,
      });
      if (error) return json({ error: error.message }, 400);
      prioridades_geradas = Number(data) || 0;
    }

    // 2) Carregar fila de prioridade
    const { data: prios, error: prioErr } = await supabase
      .from("dp_prioridade_aniversario")
      .select("colaborador_id, prioridade")
      .eq("company_id", company_id)
      .eq("ano", ano).eq("mes", mes)
      .order("prioridade", { ascending: true });
    if (prioErr) return json({ error: prioErr.message }, 400);
    if (!prios || prios.length === 0) {
      return json({ inseridas: 0, ignoradas: [], prioridades_geradas, aviso: "Sem colaboradores para sortear" });
    }

    // 3) Buscar unidades dos colaboradores + config de limite por dia
    const colabIds = prios.map((p) => p.colaborador_id);
    const { data: colabs } = await supabase
      .from("dp_colaboradores").select("id, unidade_id, ativo").in("id", colabIds);
    const unidadeDe = new Map<string, string | null>(
      (colabs ?? []).map((c) => [c.id as string, c.unidade_id as string | null]),
    );

    // 4) Gerar lista de datas-alvo (fins de semana do mês por padrão)
    const datas: string[] = [];
    const firstDay = new Date(Date.UTC(ano, mes - 1, 1));
    const lastDay = new Date(Date.UTC(ano, mes, 0));
    for (let d = new Date(firstDay); d <= lastDay; d.setUTCDate(d.getUTCDate() + 1)) {
      if (dias.includes(d.getUTCDay())) datas.push(d.toISOString().slice(0, 10));
    }

    // 5) Carregar limites por data (config sem unidade = default; com unidade = específico)
    const { data: cfg } = await supabase
      .from("dp_dia_config").select("data, unidade_id, limite_folgas")
      .eq("company_id", company_id).in("data", datas);
    const limiteDe = (data: string, unidade_id: string | null): number => {
      const rows = (cfg ?? []).filter((r) => r.data === data);
      const esp = rows.find((r) => r.unidade_id === unidade_id);
      if (esp) return esp.limite_folgas as number;
      const gen = rows.find((r) => r.unidade_id === null);
      return gen ? (gen.limite_folgas as number) : 0;
    };

    // 6) Carregar folgas já existentes no intervalo (para não duplicar / respeitar limite)
    const { data: folgasExistentes } = await supabase
      .from("dp_folgas")
      .select("data, colaborador_id, extra, tipo, status")
      .eq("company_id", company_id)
      .in("data", datas)
      .neq("status", "cancelada");

    // Sets auxiliares
    const jaFolgaColabData = new Set<string>(); // `${colab}|${data}`
    const contagemPorDiaUnidade = new Map<string, number>(); // `${data}|${unidade|null}`

    for (const f of folgasExistentes ?? []) {
      jaFolgaColabData.add(`${f.colaborador_id}|${f.data}`);
      if (f.extra) continue;
      if (["ferias", "licenca"].includes(f.tipo as string)) continue;
      const u = unidadeDe.get(f.colaborador_id as string) ?? null;
      const k = `${f.data}|${u ?? "null"}`;
      contagemPorDiaUnidade.set(k, (contagemPorDiaUnidade.get(k) ?? 0) + 1);
    }

    // Também marcar quem já tem folga em qualquer weekend do mês (evita 2 no mesmo mês)
    const jaTemFolgaNoMes = new Set<string>(
      (folgasExistentes ?? []).map((f) => f.colaborador_id as string),
    );

    // 7) Sortear: para cada data, iterar fila de prioridade e inserir até bater o limite
    const inseridas: Array<{ data: string; colaborador_id: string }> = [];
    const ignoradas: Array<{ data: string; colaborador_id: string; motivo: string }> = [];

    for (const data of datas) {
      for (const p of prios) {
        const colab_id = p.colaborador_id as string;
        if (jaTemFolgaNoMes.has(colab_id)) continue;
        if (jaFolgaColabData.has(`${colab_id}|${data}`)) continue;

        const u = unidadeDe.get(colab_id) ?? null;
        const limite = limiteDe(data, u);
        if (limite <= 0) continue;
        const k = `${data}|${u ?? "null"}`;
        if ((contagemPorDiaUnidade.get(k) ?? 0) >= limite) continue;

        const { error } = await supabase.from("dp_folgas").insert({
          company_id, colaborador_id: colab_id, data,
          tipo: "normal", origem: "sorteio", status: "agendada", extra: false,
          observacao: "Sorteio automático",
        });
        if (error) {
          ignoradas.push({ data, colaborador_id: colab_id, motivo: error.message });
          continue;
        }
        inseridas.push({ data, colaborador_id: colab_id });
        contagemPorDiaUnidade.set(k, (contagemPorDiaUnidade.get(k) ?? 0) + 1);
        jaTemFolgaNoMes.add(colab_id);
      }
    }

    return json({
      inseridas: inseridas.length,
      ignoradas,
      prioridades_geradas,
      detalhes: inseridas,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
