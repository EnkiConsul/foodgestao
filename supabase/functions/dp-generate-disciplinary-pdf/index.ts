// Edge function: dp-generate-disciplinary-pdf
// Gera a Carta de Advertência / Suspensão Disciplinar (modelo Pakerê aprimorado)
// via pdf-lib, grava em `dp-disciplinar/{company_id}/{registro_id}.pdf`
// e atualiza `dp_registros_disciplinares.pdf_storage_path`.
//
// Body: { registro_id: uuid }  →  { path, signed_url }

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireCompanyAccess, requireUser } from "../_shared/authz.ts";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "npm:pdf-lib@1.17.1";
import { z } from "npm:zod@3";

const BUCKET = "dp-disciplinar";
const BodySchema = z.object({ registro_id: z.string().uuid() });

// Mesma tabela do formulário (src/pages/dp/DpDisciplinar.tsx).
const ALINEA_POR_MOTIVO: Record<string, string> = {
  "Atraso Ou Falta Injustificada": "e",
  "Insubordinação / Descumprimento De Ordem": "h",
  "Indisciplina / Descumprimento De Normas Internas": "h",
  "Mau Procedimento / Conduta Inadequada": "b",
  "Desídia No Desempenho Das Funções": "e",
  "Ofensa Ou Agressão A Colega Ou Cliente": "j",
  "Uso Indevido De Celular No Expediente": "h",
  "Embriaguez Em Serviço": "f",
};
const ALINEA_NOME: Record<string, string> = {
  b: "incontinência de conduta ou mau procedimento",
  e: "desídia no desempenho das respectivas funções",
  f: "embriaguez habitual ou em serviço",
  h: "ato de indisciplina ou de insubordinação",
  j: "ato lesivo da honra ou da boa fama ou ofensas físicas, praticadas no serviço contra qualquer pessoa",
};

const ART_482 = [
  "Art. 482 – Constituem justa causa para rescisão do contrato de trabalho pelo empregador:",
  "a) ato de improbidade;",
  "b) incontinência de conduta ou mau procedimento;",
  "c) negociação habitual por conta própria ou alheia sem permissão do empregador, e quando constituir ato de concorrência à empresa para a qual trabalha o empregado, ou for prejudicial ao serviço;",
  "d) condenação criminal do empregado, passada em julgado, caso não tenha havido suspensão da execução da pena;",
  "e) desídia no desempenho das respectivas funções;",
  "f) embriaguez habitual ou em serviço;",
  "g) violação de segredo da empresa;",
  "h) ato de indisciplina ou de insubordinação;",
  "i) abandono de emprego;",
  "j) ato lesivo da honra ou da boa fama praticado no serviço contra qualquer pessoa, ou ofensas físicas, nas mesmas condições, salvo em caso de legítima defesa, própria ou de outrem;",
  "k) ato lesivo da honra ou da boa fama ou ofensas físicas praticadas contra o empregador e superiores hierárquicos, salvo em caso de legítima defesa, própria ou de outrem;",
  "l) prática constante de jogos de azar;",
  "m) perda da habilitação ou dos requisitos estabelecidos em lei para o exercício da profissão, em decorrência de conduta dolosa do empregado.",
  "Parágrafo único – Constitui igualmente justa causa para dispensa de empregado a prática, devidamente comprovada em inquérito administrativo, de atos atentatórios à segurança nacional.",
];

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const br = (iso: string) => { const [a, m, d] = iso.slice(0, 10).split("-"); return `${d}/${m}/${a}`; };
const extenso = (iso: string) => { const [a, m, d] = iso.slice(0, 10).split("-").map(Number); return `${d} de ${MESES[m - 1]} de ${a}`; };
const somaDias = (iso: string, n: number) => {
  const dt = new Date(`${iso.slice(0, 10)}T12:00:00Z`); dt.setUTCDate(dt.getUTCDate() + n); return dt.toISOString().slice(0, 10);
};
const cnpjFmt = (v?: string | null) => {
  const d = String(v ?? "").replace(/\D/g, "");
  return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : (v ?? "");
};
const cpfFmt = (v?: string | null) => {
  const d = String(v ?? "").replace(/\D/g, "");
  return d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") : (v ?? "");
};
// Helvetica padrão só cobre WinAnsi: remove o que não for representável.
const safe = (s: unknown) => String(s ?? "").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, "-").replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    if (!user) return json({ error: "Não autenticado" }, 401);
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseUser = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${user.token}` } } });

    const { data: reg, error: regErr } = await supabaseUser
      .from("dp_registros_disciplinares").select("*").eq("id", parsed.data.registro_id).maybeSingle();
    if (regErr || !reg) {
      if (regErr) console.error("[dp-generate-disciplinary-pdf] read:", regErr.message);
      return json({ error: "Registro não encontrado" }, 404);
    }
    if (!(await requireCompanyAccess(user.id, String(reg.company_id)))) {
      return json({ error: "Sem permissão para esta operação." }, 403);
    }

    const svc = createClient(url, service);
    const [{ data: company }, { data: colab }] = await Promise.all([
      svc.from("companies").select("*").eq("id", reg.company_id).maybeSingle(),
      svc.from("dp_colaboradores").select("*").eq("id", reg.colaborador_id).maybeSingle(),
    ]);
    const c: any = company ?? {};
    const k: any = colab ?? {};
    let cargoNome: string = k.cargo ?? k.funcao ?? "";
    if (!cargoNome && k.cargo_id) {
      const { data: cg } = await svc.from("dp_cargos").select("nome").eq("id", k.cargo_id).maybeSingle();
      cargoNome = (cg as any)?.nome ?? "";
    }
    const razao = c.razao_social ?? c.name ?? "";
    const fantasia = c.nome_fantasia ?? c.trade_name ?? "";
    const cnpj = cnpjFmt(c.cnpj);
    let cidade: string = c.cidade ?? c.city ?? "";
    if (!cidade && k.unidade_id) {
      const { data: un } = await svc.from("dp_unidades").select("*").eq("id", k.unidade_id).maybeSingle();
      const u: any = un ?? {};
      cidade = u.cidade ?? u.city ?? u.municipio ?? "";
    }
    const suspensao = reg.tipo === "suspensao";
    const dias = Number(reg.suspensao_dias ?? 0);
    const motivo = String(reg.motivo ?? "").trim();
    const alinea = ALINEA_POR_MOTIVO[motivo];

    // ---------- PDF ----------
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const W = 595, H = 842, M = 56;
    const cor = rgb(0.1, 0.1, 0.12), cinza = rgb(0.4, 0.4, 0.43);
    let page: PDFPage = pdf.addPage([W, H]);
    let y = H - M;

    const novaPagina = () => { page = pdf.addPage([W, H]); y = H - M; };
    const garantir = (h: number) => { if (y - h < 70) novaPagina(); };
    const linhas = (text: string, size: number, f: PDFFont, maxW: number) => {
      const out: string[] = [];
      for (const par of safe(text).split("\n")) {
        let line = "";
        for (const w of par.split(/\s+/).filter(Boolean)) {
          const t = line ? `${line} ${w}` : w;
          if (f.widthOfTextAtSize(t, size) > maxW && line) { out.push(line); line = w; } else line = t;
        }
        out.push(line);
      }
      return out;
    };
    const texto = (t: string, o: { size?: number; f?: PDFFont; color?: any; align?: "left" | "center" | "justify"; gap?: number; indent?: number } = {}) => {
      const size = o.size ?? 10.5, f = o.f ?? font, lh = size * 1.45, x0 = M + (o.indent ?? 0), maxW = W - M - x0;
      const ls = linhas(t, size, f, maxW);
      ls.forEach((l, i) => {
        garantir(lh);
        const wl = f.widthOfTextAtSize(l, size);
        if (o.align === "center") page.drawText(l, { x: (W - wl) / 2, y, size, font: f, color: o.color ?? cor });
        else if (o.align === "justify" && i < ls.length - 1 && l.includes(" ")) {
          const ps = l.split(" "); const extra = (maxW - wl) / (ps.length - 1); let x = x0;
          for (const p of ps) { page.drawText(p, { x, y, size, font: f, color: o.color ?? cor }); x += f.widthOfTextAtSize(p + " ", size) + extra; }
        } else page.drawText(l, { x: x0, y, size, font: f, color: o.color ?? cor });
        y -= lh;
      });
      y -= o.gap ?? 4;
    };
    const campo = (rot: string, val: string, x: number, yy: number) => {
      page.drawText(safe(rot), { x, y: yy, size: 8, font: bold, color: cinza });
      page.drawText(safe(val || "-"), { x, y: yy - 12, size: 10, font, color: cor });
    };

    // Cabeçalho da empresa
    texto(razao.toUpperCase(), { size: 12, f: bold, align: "center", gap: 0 });
    if (fantasia) texto(fantasia.toUpperCase(), { size: 9.5, align: "center", color: cinza, gap: 0 });
    if (cnpj) texto(`CNPJ ${cnpj}`, { size: 9, align: "center", color: cinza, gap: 0 });
    y -= 6;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: cor });
    y -= 26;
    texto(suspensao ? "CARTA DE SUSPENSÃO DISCIPLINAR" : "CARTA DE ADVERTÊNCIA", { size: 15, f: bold, align: "center", gap: 14 });

    // Quadro de identificação
    const boxH = 66;
    page.drawRectangle({ x: M, y: y - boxH, width: W - 2 * M, height: boxH, borderColor: cinza, borderWidth: 0.6 });
    const col = (W - 2 * M) / 3;
    campo("COLABORADOR(A)", String(k.nome ?? "").toUpperCase(), M + 10, y - 16);
    campo("CPF", cpfFmt(k.cpf), M + 10 + col * 2, y - 16);
    campo("CARGO / FUNÇÃO", String(cargoNome).toUpperCase(), M + 10, y - 46);
    campo("MATRÍCULA", String(k.matricula ?? ""), M + 10 + col, y - 46);
    campo("DATA DO DOCUMENTO", br(reg.data), M + 10 + col * 2, y - 46);
    y -= boxH + 22;

    texto(`Prezado(a) Sr(a). ${safe(k.nome ?? "")},`, { gap: 8 });
    texto(`Referente: ${suspensao ? "Suspensão Disciplinar" : "Advertência Disciplinar"}`, { f: bold, gap: 0 });
    texto(`Motivo: ${motivo || "-"}`, { f: bold, gap: 10 });

    const enq = alinea
      ? `, conduta enquadrada no Art. 482, alínea "${alinea}" (${ALINEA_NOME[alinea]}), da Consolidação das Leis do Trabalho`
      : "";
    if (suspensao) {
      const ini = somaDias(reg.data, 1), fim = somaDias(reg.data, dias), ret = somaDias(reg.data, dias + 1);
      texto(`Pela presente, comunicamos que V.Sa. está sendo SUSPENSO(A) de suas atividades por ${dias} (${dias === 1 ? "um" : dias}) dia(s), no período de ${br(ini)} a ${br(fim)}, devendo retornar ao trabalho em ${br(ret)}, em razão do descumprimento das normas da empresa e do Manual do Colaborador${enq}. Nos termos do Art. 474 da CLT, os dias de suspensão não serão remunerados e serão descontados, inclusive para efeito do repouso semanal remunerado.`, { align: "justify", gap: 10 });
    } else {
      texto(`Pela presente, fica V.Sa. ADVERTIDO(A) em razão do descumprimento das normas da empresa e do Manual do Colaborador${enq}, conforme os fatos descritos abaixo.`, { align: "justify", gap: 10 });
    }

    texto("Descrição Dos Fatos", { f: bold, gap: 2 });
    texto(String(reg.descricao ?? "-"), { align: "justify", gap: 10 });

    texto("Esclarecemos que a reincidência poderá acarretar a aplicação de penalidades mais severas, inclusive a rescisão do contrato de trabalho por justa causa, nos termos do Art. 482 da CLT, cuja transcrição segue ao final deste documento.", { align: "justify", gap: 14 });

    texto(`${cidade ? `${safe(cidade)}, ` : ""}${extenso(reg.data)}.`, { gap: 30 });

    // Assinaturas
    garantir(60);
    const metade = (W - 2 * M - 30) / 2;
    const assin = (x: number, rot: string, sub: string) => {
      page.drawLine({ start: { x, y }, end: { x: x + metade, y }, thickness: 0.6, color: cor });
      page.drawText(safe(rot), { x, y: y - 12, size: 9, font: bold, color: cor });
      page.drawText(safe(sub), { x, y: y - 23, size: 8, font, color: cinza });
    };
    assin(M, "Empregador", razao.toUpperCase().slice(0, 48));
    assin(M + metade + 30, "Ciente Do(a) Colaborador(a)", `${String(k.nome ?? "").toUpperCase().slice(0, 40)}  Data: ___/___/_____`);
    y -= 48;

    // Testemunhas em caso de recusa
    garantir(110);
    texto("Em Caso De Recusa De Assinatura", { f: bold, size: 9.5, gap: 2 });
    texto("Certificamos que a presente medida disciplinar foi lida e comunicada ao(à) colaborador(a) em nossa presença, que se recusou a assiná-la.", { size: 9, align: "justify", gap: 26 });
    garantir(40);
    assin(M, "Testemunha 1", "Nome:                                  CPF:");
    assin(M + metade + 30, "Testemunha 2", "Nome:                                  CPF:");
    y -= 40;

    // Transcrição do Art. 482
    garantir(60);
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.4, color: cinza });
    y -= 14;
    texto("Transcrição Do Art. 482 Da CLT", { f: bold, size: 8.5, color: cinza, gap: 2 });
    for (const l of ART_482) texto(l, { size: 7.5, color: cinza, gap: 0, indent: /^[a-m]\)/.test(l) ? 8 : 0 });

    // Rodapé em todas as páginas
    const rod = [razao, fantasia, cnpj ? `CNPJ ${cnpj}` : ""].filter(Boolean).join("  |  ").toUpperCase();
    const pags = pdf.getPages();
    pags.forEach((p, i) => {
      p.drawLine({ start: { x: M, y: 46 }, end: { x: W - M, y: 46 }, thickness: 0.4, color: cinza });
      const t = safe(rod);
      p.drawText(t, { x: (W - font.widthOfTextAtSize(t, 7.5)) / 2, y: 34, size: 7.5, font, color: cinza });
      const pg = `Página ${i + 1} de ${pags.length}`;
      p.drawText(pg, { x: W - M - font.widthOfTextAtSize(pg, 7), y: 22, size: 7, font, color: cinza });
    });

    const bytes = await pdf.save();
    const path = `${reg.company_id}/${reg.id}.pdf`;
    const up = await svc.storage.from(BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: true });
    if (up.error) {
      console.error("[dp-generate-disciplinary-pdf]", up.error.message);
      return json({ error: "Não foi possível concluir a operação." }, 500);
    }
    await svc.from("dp_registros_disciplinares").update({ pdf_storage_path: path }).eq("id", reg.id);
    const signed = await svc.storage.from(BUCKET).createSignedUrl(path, 300);
    return json({ path, signed_url: signed.data?.signedUrl });
  } catch (e) {
    console.error("[dp-generate-disciplinary-pdf] fatal:", e);
    return json({ error: "Não foi possível concluir a operação." }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
