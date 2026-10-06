/**
 * Emissão de recibos avulsos pelo gestor (Documentos → Emitir Recibo).
 *
 * Ações:
 *  • emitir   — grava o recibo, gera o PDF timbrado e, quando o beneficiário é
 *               colaborador, registra no acervo (resolve a pendência do mês);
 *               canal WhatsApp devolve o link de assinatura.
 *  • link     — gera um novo link de assinatura (invalida o anterior).
 *  • pdf      — devolve o PDF atual do recibo.
 *  • cancelar — cancela recibo ainda não assinado.
 *  • editar   — altera data/valores de recibo ainda não assinado e regera o PDF.
 *
 * Permissão sempre pela matriz `dp.documentos` no contexto de quem pediu.
 * Fail-closed: qualquer dúvida de permissão ou dado nega a operação.
 */
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { callerClient, requireUser, serviceClient } from "../_shared/authz.ts";
import { recordEdgeError } from "../_shared/error-log.ts";
import { sha256Hex } from "../_shared/rate-limit.ts";
import {
  cpfValido,
  gerarToken,
  montarReciboPdf,
  NATUREZA_LABEL,
  NATUREZA_TIPO_DOC,
  NATUREZAS,
  reciboDaLinha,
} from "../_shared/recibo-pdf.ts";
import { centsParaBRL } from "../_shared/quitacao.ts";

const FUNCAO = "dp-recibo-emitir";
const BUCKET = "dp-documentos";
const VALIDADE_LINK_DIAS = 15;

const Emitir = z.object({
  acao: z.literal("emitir"),
  company_id: z.string().uuid(),
  colaborador_id: z.string().uuid().nullable().optional(),
  beneficiario_nome: z.string().trim().max(160).optional(),
  beneficiario_cpf: z.string().trim().max(20).optional(),
  beneficiario_whatsapp: z.string().trim().max(20).optional(),
  unidade_id: z.string().uuid().nullable().optional(),
  natureza: z.enum(NATUREZAS),
  descricao: z.string().trim().max(500).optional(),
  competencia: z.string().regex(/^\d{4}-\d{2}$/),
  pago_em: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  valor_cents: z.number().int().positive().max(100_000_000),
  modalidade: z.enum(["bancario", "especie", "misto"]),
  valor_bancario_cents: z.number().int().nonnegative().nullable().optional(),
  valor_especie_cents: z.number().int().nonnegative().nullable().optional(),
  canal_assinatura: z.enum(["portal", "whatsapp", "fisico"]),
  substitui_recibo_id: z.string().uuid().nullable().optional(),
});
const Editar = z.object({
  acao: z.literal("editar"),
  recibo_id: z.string().uuid(),
  descricao: z.string().trim().max(500).optional(),
  competencia: z.string().regex(/^\d{4}-\d{2}$/),
  pago_em: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  valor_cents: z.number().int().positive().max(100_000_000),
  modalidade: z.enum(["bancario", "especie", "misto"]),
  valor_bancario_cents: z.number().int().nonnegative().nullable().optional(),
  valor_especie_cents: z.number().int().nonnegative().nullable().optional(),
  canal_assinatura: z.enum(["portal", "whatsapp", "fisico"]).optional(),
  beneficiario_whatsapp: z.string().trim().max(20).optional(),
});
const PorId = z.object({
  acao: z.enum(["link", "pdf", "cancelar"]),
  recibo_id: z.string().uuid(),
  /** Via limpa para assinar à mão (sem carimbos nem data de emissão). */
  manual: z.boolean().optional(),
});
const Body = z.union([Emitir, Editar, PorId]);
const MAX_DIAS_FUTURO = 60;

/** Data de pagamento: passada livre, futura até 60 dias (BRT). */
function dataPagamentoInvalida(pagoEm: string): string | null {
  const limite = new Date(Date.now() - 3 * 3600_000 + MAX_DIAS_FUTURO * 86400_000).toISOString().slice(0, 10);
  return pagoEm > limite ? `A data do pagamento pode ser no máximo ${MAX_DIAS_FUTURO} dias à frente.` : null;
}
function partes(modalidade: string, total: number, banco?: number | null, especie?: number | null) {
  const b = modalidade === "especie" ? 0 : Number(banco ?? 0);
  const e = modalidade === "bancario" ? 0 : Number(especie ?? 0);
  if (modalidade === "misto") {
    if (b <= 0 || e <= 0) return { erro: "No pagamento misto informe a parte em conta e a parte em dinheiro." };
    if (b + e !== total) return { erro: "A soma das partes precisa ser igual ao valor total." };
  }
  return {
    valor_bancario_cents: modalidade === "especie" ? null : (modalidade === "bancario" ? total : b),
    valor_especie_cents: modalidade === "bancario" ? null : (modalidade === "especie" ? total : e),
  };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
const erro = (status: number, mensagem: string) => json(status, { error: mensagem });

function origemPermitida(req: Request): string {
  const o = req.headers.get("origin") ?? "";
  try {
    const h = new URL(o).hostname.toLowerCase();
    if (
      h === "aveto360.com" || h === "www.aveto360.com" || h === "localhost" ||
      h.endsWith(".lovable.app") || h.endsWith(".lovableproject.com")
    ) return new URL(o).origin;
  } catch { /* origem inválida */ }
  return "https://aveto360.com";
}

async function permitido(token: string, companyId: string, nivel: string): Promise<boolean> {
  const { data, error } = await callerClient(token).rpc("tem_permissao", {
    _company_id: companyId,
    _item: "dp.documentos",
    _nivel: nivel,
  });
  return !error && data === true;
}


async function novoLink(admin: ReturnType<typeof serviceClient>, reciboId: string, req: Request) {
  const { data: recibo } = await admin.from("dp_recibos")
    .select("id, colaborador_id, canal_assinatura, cancelado_em, assinado_em")
    .eq("id", reciboId).maybeSingle();
  if (!recibo || recibo.cancelado_em || recibo.assinado_em) throw new Error("RECIBO_INDISPONIVEL");
  if (recibo.canal_assinatura !== "whatsapp") throw new Error("RECIBO_CANAL_INVALIDO");
  const token = gerarToken();
  const expira = new Date(Date.now() + VALIDADE_LINK_DIAS * 86400_000).toISOString();
  const { error } = await admin.from("dp_recibos").update({
    link_token_hash: await sha256Hex(token),
    link_expira_em: expira,
    link_enviado_em: new Date().toISOString(),
  }).eq("id", reciboId);
  if (error) throw error;
  return { link: `${origemPermitida(req)}/recibo/${token}`, expira_em: expira };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return erro(405, "Método inválido.");

  let companyId: string | null = null;
  try {
    const caller = await requireUser(req);
    if (!caller) return erro(401, "Sessão expirada. Entre novamente.");
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return erro(400, "Dados do recibo inválidos.");
    const admin = serviceClient();
    const b = parsed.data;

    if (b.acao !== "emitir") {
      // Leitura no contexto do gestor (RLS) confirma a visibilidade.
      const { data: visivel } = await callerClient(caller.token)
        .from("dp_recibos").select("id, company_id").eq("id", b.recibo_id).maybeSingle();
      if (!visivel) return erro(403, "Sem permissão para este recibo.");
      companyId = visivel.company_id as string;
      const { data: row } = await admin.from("dp_recibos").select("*").eq("id", b.recibo_id).single();

      if (b.acao === "pdf") {
        const { data: empresa } = await admin.from("companies").select("name, trade_name, cnpj")
          .eq("id", companyId).maybeSingle();
        let imgAceite: string | null = null;
        if (!row.assinatura_imagem && row.documento_id && row.assinado_em) {
          const { data: ac } = await admin.from("dp_documento_aceites").select("assinatura_imagem")
            .eq("documento_id", row.documento_id).not("assinatura_imagem", "is", null)
            .order("aceito_em", { ascending: false }).limit(1).maybeSingle();
          imgAceite = (ac?.assinatura_imagem as string | null) ?? null;
        }
        const dados = reciboDaLinha(row, empresa, imgAceite);
        // Canal físico já sai em duas vias; digital pendente mantém o modelo digital.
        const manual = "manual" in b && !!b.manual;
        const bytes = await montarReciboPdf(
          manual ? { ...dados, assinatura: null, assinaturaImagem: null, canal: "fisico", manual: true } : dados,
        );
        return new Response(bytes as unknown as BodyInit, {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/pdf",
            "Content-Disposition": 'inline; filename="recibo.pdf"',
            "Cache-Control": "no-store",
          },
        });
      }
      if (!(await permitido(caller.token, companyId, "alteracao"))) {
        return erro(403, "Sem permissão para alterar recibos.");
      }
      if (row.cancelado_em) return erro(409, "Este recibo foi cancelado.");
      if (row.assinado_em) {
        return erro(409, b.acao === "editar"
          ? "Este recibo já foi assinado e não pode ser alterado. Emita uma nova via corrigida a partir dele."
          : "Este recibo já foi assinado.");
      }
      if (b.acao === "editar") {
        if (row.documento_id) {
          const { data: docVia } = await admin.from("dp_documentos").select("via_assinada_path")
            .eq("id", row.documento_id).maybeSingle();
          if (docVia?.via_assinada_path) {
            return erro(409, "A via assinada à mão já foi importada, então este recibo não pode mais ser alterado. Emita uma nova via corrigida a partir dele.");
          }
        }
        const canalNovo = b.canal_assinatura ?? row.canal_assinatura;
        if (!row.colaborador_id && canalNovo === "portal") {
          return erro(400, "Pessoa sem cadastro não acessa o portal. Escolha WhatsApp ou Assinatura à Mão.");
        }
        const trocaCanal = canalNovo !== row.canal_assinatura;
        const invalida = dataPagamentoInvalida(b.pago_em);
        if (invalida) return erro(400, invalida);
        const pt = partes(b.modalidade, b.valor_cents, b.valor_bancario_cents, b.valor_especie_cents);
        if ("erro" in pt) return erro(400, pt.erro!);
        // Recibo avulso (pessoa sem cadastro): o WhatsApp do beneficiário pode ser corrigido na edição.
        const whatsNovo = !row.colaborador_id && b.beneficiario_whatsapp !== undefined
          ? (b.beneficiario_whatsapp.replace(/\D+/g, "") || null)
          : undefined;
        const { data: nova, error: upErr } = await admin.from("dp_recibos").update({
          descricao: b.descricao || null,
          competencia: `${b.competencia}-01`,
          pago_em: b.pago_em,
          valor_cents: b.valor_cents,
          modalidade: b.modalidade,
          ...pt,
          ...(whatsNovo !== undefined ? { beneficiario_whatsapp: whatsNovo } : {}),
          ...(trocaCanal ? { canal_assinatura: canalNovo, link_token_hash: null, link_expira_em: null, link_enviado_em: null } : {}),
          updated_at: new Date().toISOString(),
        }).eq("id", row.id).is("assinado_em", null).select("*").single();
        if (upErr || !nova) throw upErr ?? new Error("update dp_recibos");
        const { data: empresa } = await admin.from("companies").select("name, trade_name, cnpj")
          .eq("id", companyId).maybeSingle();
        const bytes = await montarReciboPdf(reciboDaLinha(nova, empresa));
        if (nova.file_path) {
          const envio = await admin.storage.from(BUCKET).upload(nova.file_path, bytes, { contentType: "application/pdf", upsert: true });
          if (envio.error) throw envio.error;
        }
        if (nova.documento_id) {
          await admin.from("dp_documentos").update({
            arquivo_sha256: null,
            file_size: bytes.byteLength,
            referencia_data: `${b.competencia}-01`,
            descricao: `Recibo emitido pelo sistema: ${centsParaBRL(b.valor_cents)}, pago em ${b.pago_em.split("-").reverse().join("/")}.`,
            ...(trocaCanal ? { exige_aceite: canalNovo === "portal", assinatura_fisica: canalNovo === "fisico" } : {}),
            updated_at: new Date().toISOString(),
          }).eq("id", nova.documento_id);
        }
        return json(200, { ok: true });
      }
      if (b.acao === "cancelar") {
        const { error: cancelarErro } = await admin.rpc("dp_recibo_cancelar", {
          p_recibo_id: row.id,
          p_cancelado_por: caller.id,
        });
        if (cancelarErro) throw cancelarErro;
        return json(200, { ok: true });
      }
      if (row.canal_assinatura !== "whatsapp") {
        return erro(409, "Este recibo não foi emitido para assinatura por link.");
      }
      return json(200, { ...(await novoLink(admin, row.id, req)), whatsapp: row.beneficiario_whatsapp });
    }

    // ---------------- emitir ----------------
    companyId = b.company_id;
    if (!(await permitido(caller.token, b.company_id, "inclusao"))) {
      return erro(403, "Sem permissão para emitir recibos.");
    }

    const pt = partes(b.modalidade, b.valor_cents, b.valor_bancario_cents, b.valor_especie_cents);
    if ("erro" in pt) return erro(400, pt.erro!);
    const invalida = dataPagamentoInvalida(b.pago_em);
    if (invalida) return erro(400, invalida);
    if (b.natureza === "rescisao" && b.canal_assinatura !== "fisico") {
      return erro(400, "Rescisão e quitação rescisória são assinadas só à mão, em duas vias.");
    }
    let original: Record<string, unknown> | null = null;
    if (b.substitui_recibo_id) {
      const { data: o } = await admin.from("dp_recibos").select("id, company_id, assinado_em, cancelado_em, substituido_em")
        .eq("id", b.substitui_recibo_id).maybeSingle();
      if (!o || o.company_id !== b.company_id) return erro(403, "Recibo original não encontrado.");
      if (!o.assinado_em || o.cancelado_em || o.substituido_em) return erro(409, "Só é possível substituir recibo assinado e ainda vigente.");
      original = o;
    }

    let nome = b.beneficiario_nome?.toUpperCase() ?? "";
    let cpf = (b.beneficiario_cpf ?? "").replace(/\D+/g, "");
    let whatsapp = (b.beneficiario_whatsapp ?? "").replace(/\D+/g, "");
    let unidadeId = b.unidade_id ?? null;

    if (b.colaborador_id) {
      const { data: colab } = await admin.from("dp_colaboradores")
        .select("id, company_id, nome, nome_social, cpf, whatsapp, telefone, unidade_id, ativo")
        .eq("id", b.colaborador_id).maybeSingle();
      if (!colab || colab.company_id !== b.company_id) return erro(403, "Colaborador não pertence à empresa.");
      nome = String(colab.nome_social || colab.nome || "").toUpperCase();
      cpf = String(colab.cpf ?? "").replace(/\D+/g, "");
      whatsapp = whatsapp || String(colab.whatsapp || colab.telefone || "").replace(/\D+/g, "");
      unidadeId = colab.unidade_id ?? unidadeId;
    } else {
      if (b.canal_assinatura === "portal") return erro(400, "Pessoa sem cadastro não acessa o portal. Use WhatsApp ou assinatura à mão.");
      if (nome.length < 3) return erro(400, "Informe o nome completo de quem recebeu.");
      if (!cpfValido(cpf)) return erro(400, "Informe um CPF válido de quem recebeu.");
    }
    if (b.canal_assinatura === "whatsapp" && whatsapp.length < 10) {
      return erro(400, "Informe o WhatsApp de quem vai assinar.");
    }

    const { data: row, error: insErr } = await admin.from("dp_recibos").insert({
      company_id: b.company_id,
      unidade_id: unidadeId,
      colaborador_id: b.colaborador_id ?? null,
      beneficiario_nome: nome,
      beneficiario_cpf: cpf || null,
      beneficiario_whatsapp: whatsapp || null,
      natureza: b.natureza,
      descricao: b.descricao || null,
      competencia: `${b.competencia}-01`,
      pago_em: b.pago_em,
      valor_cents: b.valor_cents,
      modalidade: b.modalidade,
      ...pt,
      canal_assinatura: b.canal_assinatura,
      substitui_recibo_id: original ? b.substitui_recibo_id : null,
      created_by: caller.id,
    }).select("*").single();
    if (insErr || !row) throw insErr ?? new Error("insert dp_recibos");

    const { data: empresa } = await admin.from("companies").select("name, trade_name, cnpj")
      .eq("id", b.company_id).maybeSingle();
    const bytes = await montarReciboPdf(reciboDaLinha(row, empresa));
    const pasta = b.colaborador_id ? `${b.company_id}/${b.colaborador_id}/recibos` : `${b.company_id}/recibos-avulsos`;
    const caminho = `${pasta}/${row.id}.pdf`;
    const envio = await admin.storage.from(BUCKET).upload(caminho, bytes, { contentType: "application/pdf", upsert: true });
    if (envio.error) {
      await admin.from("dp_recibos").delete().eq("id", row.id);
      throw envio.error;
    }
    const atualiza: Record<string, unknown> = { file_path: caminho };

    if (b.colaborador_id) {
      const { data: docId, error: regErr } = await callerClient(caller.token).rpc("dp_documento_registrar", {
        p_dados: {
          company_id: b.company_id,
          colaborador_id: b.colaborador_id,
          unidade_id: unidadeId,
          tipo: NATUREZA_TIPO_DOC[b.natureza],
          titulo: `Recibo de Pagamento — ${NATUREZA_LABEL[b.natureza]} ${b.competencia.slice(5, 7)}/${b.competencia.slice(0, 4)}`,
          descricao: `Recibo emitido pelo sistema: ${centsParaBRL(b.valor_cents)}, pago em ${b.pago_em.split("-").reverse().join("/")}.`,
          file_path: caminho,
          file_name: `recibo-${b.natureza}-${b.competencia}.pdf`,
          file_size: bytes.byteLength,
          mime_type: "application/pdf",
          referencia_data: `${b.competencia}-01`,
          exige_aceite: b.canal_assinatura === "portal",
        },
      });
      if (regErr || !docId) {
        await admin.storage.from(BUCKET).remove([caminho]);
        await admin.from("dp_recibos").delete().eq("id", row.id);
        return erro(400, "O recibo não pôde ser registrado no acervo do colaborador.");
      }
      atualiza.documento_id = String(docId);
      if (b.canal_assinatura === "fisico") {
        await admin.from("dp_documentos").update({ assinatura_fisica: true }).eq("id", String(docId));
      }
    }
    await admin.from("dp_recibos").update(atualiza).eq("id", row.id);

    if (atualiza.documento_id) {
      const { error: vinculoErro } = await admin.rpc("dp_recibo_vincular_documento", {
        p_recibo_id: row.id,
        p_documento_id: atualiza.documento_id,
      });
      if (vinculoErro) {
        await admin.storage.from(BUCKET).remove([caminho]);
        await admin.from("dp_recibos").delete().eq("id", row.id);
        throw vinculoErro;
      }
    }

    if (original) {
      await admin.from("dp_recibos").update({
        substituido_em: new Date().toISOString(),
        motivo_substituicao: "Substituído por nova via corrigida",
      }).eq("id", original.id as string).is("substituido_em", null);
    }

    let link: { link: string; expira_em: string } | null = null;
    if (b.canal_assinatura === "whatsapp") link = await novoLink(admin, row.id, req);

    // Pendências do mês passam a refletir o novo documento.
    if (b.colaborador_id) {
      await admin.rpc("dp_refresh_document_pending", { p_company_id: b.company_id }).then(() => {}, () => {});
    }

    return json(200, {
      recibo_id: row.id,
      documento_id: atualiza.documento_id ?? null,
      whatsapp: whatsapp || null,
      ...(link ?? {}),
    });
  } catch (e) {
    await recordEdgeError({ functionName: FUNCAO, action: "emitir recibo", error: e, companyId });
    return erro(500, "Não foi possível concluir agora. Tente novamente.");
  }
});
