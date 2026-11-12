// Relação de adiantamento salarial da competência (gestor/contabilidade).
//
// O servidor (`dp_adiantamento_relacao`) decide quem recebe na competência
// (optantes elegíveis no dia do pagamento) e quem mudou; CPF, salário e dados
// de pagamento chegam pela consulta segura, mascarados sem "Ver salários".
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { supabase } from "@/integrations/supabase/client";
import { buscarConfidencial } from "@/lib/dp/confidencial";
import { cpfFmt } from "@/lib/dp/termos-freelancer";
import { rotuloCompetencia } from "@/lib/dp/adiantamento-opcao";
import { montarCsv } from "@/lib/dp/portal-csv";

export type SituacaoRelacao = "optante" | "nova_adesao" | "cancelado";
export type TermoSituacao =
  | "assinado"
  | "assinado_papel"
  | "papel_existente"
  | "aguardando_assinatura"
  | "aguardando_via"
  | "sem_termo";

export type LinhaRelacao = {
  colaborador_id: string;
  nome: string;
  cargo: string | null;
  unidade_id: string;
  unidade_nome: string;
  dia_adiantamento: number;
  pagamento_em: string;
  regime: string | null;
  situacao: SituacaoRelacao;
  mudanca_data: string | null;
  mudanca_origem: "portal" | "gestor" | null;
  termo_situacao: TermoSituacao | null;
  termo_documento_id: string | null;
  // Confidenciais (consulta segura)
  cpf: string | null;
  salario_base: number | null;
  banco_nome: string | null;
  agencia: string | null;
  conta: string | null;
  conta_digito: string | null;
  pix_tipo: string | null;
  pix_chave: string | null;
  liberado: boolean;
};

export const SITUACAO_LABEL: Record<SituacaoRelacao, string> = {
  optante: "Optante",
  nova_adesao: "Nova adesão",
  cancelado: "Suspenso neste mês",
};

export const TERMO_LABEL: Record<TermoSituacao, string> = {
  assinado: "Termo assinado",
  assinado_papel: "Termo assinado em papel",
  papel_existente: "Termo em papel (gestor)",
  aguardando_assinatura: "Aguardando assinatura",
  aguardando_via: "Aguardando via assinada",
  sem_termo: "Sem termo",
};

/** Termo resolvido? (pendências aparecem em destaque para o gestor). */
export function termoPendente(t: TermoSituacao | null | undefined): boolean {
  return t === "aguardando_assinatura" || t === "aguardando_via" || t === "sem_termo";
}

export async function carregarRelacao(
  companyId: string,
  competencia: string,
  unidadeId: string | null,
): Promise<LinhaRelacao[]> {
  const { data, error } = await supabase.rpc("dp_adiantamento_relacao", {
    p_company: companyId,
    p_competencia: competencia,
    p_unidade: unidadeId ?? undefined,
  });
  if (error) throw error;
  const base = (data ?? []) as Omit<LinhaRelacao, "cpf" | "salario_base" | "banco_nome" | "agencia" | "conta" | "conta_digito" | "pix_tipo" | "pix_chave" | "liberado">[];
  if (!base.length) return [];
  const conf = await buscarConfidencial(companyId, base.map((l) => l.colaborador_id));
  return base.map((l) => {
    const c = conf.get(l.colaborador_id);
    const txt = (v: unknown) => (v == null || v === "" ? null : String(v));
    return {
      ...l,
      cpf: txt(c?.cpf),
      salario_base: c?.salario_base == null || c.salario_base === "" ? null : Number(c.salario_base),
      banco_nome: txt(c?.banco_nome),
      agencia: txt(c?.agencia),
      conta: txt(c?.conta),
      conta_digito: txt(c?.conta_digito),
      pix_tipo: txt(c?.pix_tipo),
      pix_chave: txt(c?.pix_chave),
      liberado: c?.liberado ?? false,
    };
  });
}

export type ResumoRelacao = { recebem: number; novas: number; suspensos: number; termosPendentes: number; salarios: number };

export function resumoRelacao(linhas: Pick<LinhaRelacao, "situacao" | "termo_situacao" | "salario_base">[]): ResumoRelacao {
  const recebem = linhas.filter((l) => l.situacao !== "cancelado");
  return {
    recebem: recebem.length,
    novas: linhas.filter((l) => l.situacao === "nova_adesao").length,
    suspensos: linhas.filter((l) => l.situacao === "cancelado").length,
    termosPendentes: recebem.filter((l) => termoPendente(l.termo_situacao)).length,
    salarios: recebem.reduce((a, l) => a + (Number.isFinite(l.salario_base ?? NaN) ? Number(l.salario_base) : 0), 0),
  };
}

const brl = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? "" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (iso?: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");

export function contaTexto(l: Pick<LinhaRelacao, "banco_nome" | "agencia" | "conta" | "conta_digito">): string {
  if (!l.agencia && !l.conta) return "";
  return [l.banco_nome, l.agencia ? `Ag. ${l.agencia}` : null, l.conta ? `CC ${l.conta}${l.conta_digito ? `-${l.conta_digito}` : ""}` : null]
    .filter(Boolean)
    .join(" · ");
}

export type MetaRelacao = {
  empresa: string;
  cnpj?: string | null;
  unidade: string; // "Todas as unidades" ou nome
  competencia: string;
};

export function relacaoCsv(linhas: LinhaRelacao[], meta: MetaRelacao): string {
  const cab = ["Competência", "Unidade", "Colaborador", "CPF", "Cargo", "Salário base", "Pagamento do adiantamento", "Banco", "Agência", "Conta", "Tipo da chave Pix", "Chave Pix", "Situação", "Termo"];
  const corpo = linhas.map((l) => [
    rotuloCompetencia(meta.competencia), l.unidade_nome, l.nome, cpfFmt(l.cpf) ?? "", l.cargo ?? "",
    l.salario_base == null ? "" : l.salario_base.toFixed(2).replace(".", ","), dataBR(l.pagamento_em),
    l.banco_nome ?? "", l.agencia ?? "", l.conta ? `${l.conta}${l.conta_digito ? `-${l.conta_digito}` : ""}` : "",
    l.pix_tipo ?? "", l.pix_chave ?? "", SITUACAO_LABEL[l.situacao], l.termo_situacao ? TERMO_LABEL[l.termo_situacao] : "",
  ]);
  return montarCsv(cab, corpo);
}

// ---------------------------------------------------------------- PDF

const AZUL = rgb(0.06, 0.11, 0.24);
const LARANJA = rgb(0.92, 0.38, 0.1);
const CINZA = rgb(0.42, 0.45, 0.5);
const ZEBRA = rgb(0.95, 0.96, 0.98);
const BRANCO = rgb(1, 1, 1);

function limpar(t: string) {
  return t.replace(/[—–]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\xFF\n]/g, "");
}

function caber(t: string, fonte: PDFFont, s: number, larg: number): string {
  let x = limpar(t);
  if (fonte.widthOfTextAtSize(x, s) <= larg) return x;
  while (x.length > 1 && fonte.widthOfTextAtSize(`${x}...`, s) > larg) x = x.slice(0, -1);
  return `${x}...`;
}

export async function gerarRelacaoPdf(linhas: LinhaRelacao[], meta: MetaRelacao): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const f = await pdf.embedFont(StandardFonts.Helvetica);
  const b = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 842, H = 595, M = 32, L = W - M * 2;
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;
  const texto = (t: string, x: number, yy: number, s = 9, fonte: PDFFont = f, cor = AZUL) =>
    page.drawText(limpar(t), { x, y: yy, size: s, font: fonte, color: cor });

  const pagamento = linhas[0]?.pagamento_em;
  const cabecalho = () => {
    page.drawRectangle({ x: 0, y: H - 5, width: W, height: 5, color: LARANJA });
    texto(meta.empresa, M, y - 6, 13, b);
    texto([meta.cnpj ? `CNPJ ${meta.cnpj}` : null, meta.unidade].filter(Boolean).join("  ·  "), M, y - 20, 9, f, CINZA);
    const titulo = `RELAÇÃO DE ADIANTAMENTO SALARIAL · ${rotuloCompetencia(meta.competencia).toUpperCase()}`;
    texto(titulo, W - M - b.widthOfTextAtSize(limpar(titulo), 11), y - 6, 11, b);
    const sub = pagamento && !meta.unidade.startsWith("Todas") ? `Pagamento em ${dataBR(pagamento)}` : "Pagamento conforme o dia de cada unidade";
    texto(sub, W - M - f.widthOfTextAtSize(limpar(sub), 9), y - 20, 9, f, CINZA);
    y -= 30;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: AZUL });
    y -= 14;
  };
  cabecalho();

  const r = resumoRelacao(linhas);
  const caixas: [string, string][] = [
    ["RECEBEM NESTA COMPETÊNCIA", String(r.recebem)],
    ["NOVAS ADESÕES", String(r.novas)],
    ["SUSPENSÕES", String(r.suspensos)],
    ["SOMA DOS SALÁRIOS BASE", r.salarios > 0 ? brl(r.salarios) : "-"],
  ];
  const lc = (L - 3 * 10) / 4;
  caixas.forEach(([rot, val], i) => {
    const x = M + i * (lc + 10);
    page.drawRectangle({ x, y: y - 34, width: lc, height: 34, color: ZEBRA });
    texto(rot, x + 8, y - 12, 7, b, LARANJA);
    texto(val, x + 8, y - 27, 12, b);
  });
  y -= 48;

  const mostrarUnidade = meta.unidade.startsWith("Todas");
  const cols = [
    { t: "#", w: 0.03 },
    { t: "Colaborador / Cargo", w: mostrarUnidade ? 0.2 : 0.25 },
    ...(mostrarUnidade ? [{ t: "Unidade", w: 0.09 }] : []),
    { t: "CPF", w: 0.1 },
    { t: "Salário base", w: 0.09 },
    { t: "Banco / Agência / Conta", w: mostrarUnidade ? 0.18 : 0.2 },
    { t: "Chave Pix", w: 0.15 },
    { t: "Termo", w: mostrarUnidade ? 0.16 : 0.18 },
  ];
  const ROW = 24;
  const cabecalhoTabela = () => {
    page.drawRectangle({ x: M, y: y - 16, width: L, height: 16, color: AZUL });
    let x = M + 4;
    cols.forEach((c) => { texto(c.t, x, y - 11, 7.5, b, BRANCO); x += c.w * L; });
    y -= 16;
  };
  const garantir = (alt: number) => {
    if (y - alt < M + 30) { page = pdf.addPage([W, H]); y = H - M; cabecalho(); cabecalhoTabela(); }
  };

  const secao = (titulo: string, itens: LinhaRelacao[]) => {
    if (!itens.length) return;
    garantir(40);
    texto(titulo, M, y - 4, 10, b); y -= 12;
    cabecalhoTabela();
    itens.forEach((l, i) => {
      garantir(ROW);
      if (i % 2) page.drawRectangle({ x: M, y: y - ROW, width: L, height: ROW, color: ZEBRA });
      let x = M + 4;
      const cel = (linha1: string, linha2: string | null, w: number, negrito = false) => {
        const larg = w * L - 6;
        texto(caber(linha1 || "-", negrito ? b : f, 8, larg), x, y - 10, 8, negrito ? b : f);
        if (linha2) texto(caber(linha2, f, 7, larg), x, y - 19, 7, f, CINZA);
        x += w * L;
      };
      const semPermissao = !l.liberado ? "Sem permissão" : null;
      cel(String(i + 1), null, cols[0].w);
      cel(l.nome, [l.cargo, l.situacao === "nova_adesao" ? "Nova adesão" : null].filter(Boolean).join(" · ") || null, cols[1].w, true);
      let k = 2;
      if (mostrarUnidade) cel(l.unidade_nome, null, cols[k++].w);
      cel(semPermissao ?? (cpfFmt(l.cpf) ?? ""), null, cols[k++].w);
      cel(semPermissao ?? brl(l.salario_base), null, cols[k++].w);
      cel(semPermissao ?? contaTexto(l), null, cols[k++].w);
      cel(semPermissao ?? (l.pix_chave ?? ""), l.pix_tipo ? l.pix_tipo.toUpperCase() : null, cols[k++].w);
      cel(l.situacao === "cancelado" ? `Suspenso desde ${dataBR(l.mudanca_data)}` : l.termo_situacao ? TERMO_LABEL[l.termo_situacao] : "-",
        l.mudanca_data && l.situacao !== "cancelado" && l.situacao === "nova_adesao" ? `Pedido em ${dataBR(l.mudanca_data)} (${l.mudanca_origem === "portal" ? "portal" : "gestor"})` : null,
        cols[k++].w);
      y -= ROW;
    });
    y -= 12;
  };

  const recebem = linhas.filter((l) => l.situacao !== "cancelado");
  const suspensos = linhas.filter((l) => l.situacao === "cancelado");
  if (!recebem.length && !suspensos.length) {
    texto("Nenhum colaborador optante nesta competência.", M, y - 6, 10, f, CINZA);
    y -= 20;
  }
  secao(`Recebem o adiantamento (${recebem.length})`, recebem);
  secao(`Suspenderam a partir desta competência - não recebem (${suspensos.length})`, suspensos);

  garantir(30);
  texto("O valor de cada adiantamento segue a regra da empresa e da convenção coletiva; esta relação lista quem recebe e os dados de pagamento.", M, y - 4, 7.5, f, CINZA);

  const pags = pdf.getPages();
  const emitido = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  pags.forEach((p, i) => {
    p.drawText(limpar(`Relação de adiantamento salarial · ${rotuloCompetencia(meta.competencia)} · Emitido em ${emitido} · Página ${i + 1} de ${pags.length}`), { x: M, y: 16, size: 7, font: f, color: CINZA });
  });
  return pdf.save();
}

/** Baixa um arquivo gerado no navegador (pedido explícito do gestor). */
export function baixarArquivo(nome: string, conteudo: BlobPart, tipo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
