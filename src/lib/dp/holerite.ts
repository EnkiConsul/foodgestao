// ------------------------------------------------------------------
// Domínio: DP → Holerite (demonstrativo de pagamento) — Fase 15
//
// Monta as linhas de proventos/descontos de um lançamento de folha e
// gera o HTML imprimível. Funções puras (a impressão fica isolada em
// `imprimirHolerite`, único ponto que toca no browser).
// ------------------------------------------------------------------

import { encargosDoLancamento, FOLHA_TIPO_LABEL, formatarBRL, type DetalheFolha } from "./folha";

export interface HoleriteDados {
  empresa: string;
  colaborador: string;
  cargo?: string | null;
  competencia: string;
  tipo: string;
  detalhe: DetalheFolha;
  valorBruto: number;
  valorLiquido: number;
  dataPagamento?: string | null;
}

export interface LinhaHolerite {
  descricao: string;
  referencia: string;
  provento: number;
  desconto: number;
}

const horas = (v: number) => (v > 0 ? `${v.toFixed(2).replace(".", ",")} h` : "—");

/** Linhas do demonstrativo, omitindo rubricas zeradas (exceto proventos normais). */
export function linhasDoHolerite(d: HoleriteDados): LinhaHolerite[] {
  const { detalhe } = d;
  const linhas: LinhaHolerite[] = [
    {
      descricao: "Horas normais",
      referencia: horas(detalhe.horas.normais),
      provento: detalhe.proventos.normais,
      desconto: 0,
    },
    {
      descricao: "Horas extras 50%",
      referencia: horas(detalhe.horas.extras50),
      provento: detalhe.proventos.extras50,
      desconto: 0,
    },
    {
      descricao: "Horas extras 100%",
      referencia: horas(detalhe.horas.extras100),
      provento: detalhe.proventos.extras100,
      desconto: 0,
    },
    {
      descricao: "Adicional noturno",
      referencia: horas(detalhe.horas.noturnos),
      provento: detalhe.proventos.noturno,
      desconto: 0,
    },
    {
      descricao: "Faltas",
      referencia: detalhe.horas.diasFalta > 0 ? `${detalhe.horas.diasFalta} dia(s)` : "—",
      provento: 0,
      desconto: detalhe.faltas,
    },
    {
      descricao: "DSR sobre faltas",
      referencia: detalhe.horas.dsrPerdidos > 0 ? `${detalhe.horas.dsrPerdidos} dia(s)` : "—",
      provento: 0,
      desconto: detalhe.dsr,
    },
  ];
  const enc = encargosDoLancamento(detalhe);
  linhas.push(
    { descricao: "INSS", referencia: `sobre ${formatarBRL(enc.baseInss)}`, provento: 0, desconto: enc.inss },
    { descricao: "IRRF", referencia: `sobre ${formatarBRL(enc.baseIrrf)}`, provento: 0, desconto: enc.irrf },
  );
  for (const e of detalhe.extras) {
    linhas.push({
      descricao: e.descricao,
      referencia: "—",
      provento: e.natureza === "provento" ? e.valor : 0,
      desconto: e.natureza === "desconto" ? e.valor : 0,
    });
  }
  return linhas.filter((l, i) => i === 0 || l.provento > 0 || l.desconto > 0);
}

export interface TotaisHolerite {
  proventos: number;
  descontos: number;
  liquido: number;
}

export function totaisDoHolerite(linhas: LinhaHolerite[]): TotaisHolerite {
  const proventos = linhas.reduce((s, l) => s + l.provento, 0);
  const descontos = linhas.reduce((s, l) => s + l.desconto, 0);
  return { proventos, descontos, liquido: proventos - descontos };
}

export const rotuloCompetenciaHolerite = (iso: string) =>
  iso
    ? new Date(`${iso.slice(0, 7)}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
    : "—";

const esc = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const valor = (v: number) => (v > 0 ? formatarBRL(v) : "—");

/** HTML de um demonstrativo (usado no print e nos testes). */
export function holeriteHtml(d: HoleriteDados): string {
  const linhas = linhasDoHolerite(d);
  const totais = totaisDoHolerite(linhas);
  const pagamento = d.dataPagamento
    ? new Date(`${d.dataPagamento}T12:00:00`).toLocaleDateString("pt-BR")
    : "A definir";

  return `
    <section class="holerite">
      <header>
        <div>
          <h2>Demonstrativo de Pagamento</h2>
          <p>${esc(d.empresa)}</p>
        </div>
        <div class="comp">
          <p><strong>${esc(rotuloCompetenciaHolerite(d.competencia))}</strong></p>
          <p>${esc(FOLHA_TIPO_LABEL[d.tipo] ?? d.tipo)}</p>
        </div>
      </header>

      <table class="ident">
        <tr>
          <td><span>Colaborador</span><strong>${esc(d.colaborador)}</strong></td>
          <td><span>Cargo</span><strong>${esc(d.cargo || "—")}</strong></td>
          <td><span>Pagamento</span><strong>${esc(pagamento)}</strong></td>
        </tr>
      </table>

      <table class="rubricas">
        <thead>
          <tr><th>Descrição</th><th>Referência</th><th>Proventos</th><th>Descontos</th></tr>
        </thead>
        <tbody>
          ${linhas
            .map(
              (l) => `<tr>
            <td>${esc(l.descricao)}</td>
            <td class="c">${esc(l.referencia)}</td>
            <td class="r">${valor(l.provento)}</td>
            <td class="r">${valor(l.desconto)}</td>
          </tr>`,
            )
            .join("")}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="2">Totais</td>
            <td class="r">${formatarBRL(totais.proventos)}</td>
            <td class="r">${formatarBRL(totais.descontos)}</td>
          </tr>
          <tr class="liquido">
            <td colspan="3">Líquido a receber</td>
            <td class="r">${formatarBRL(d.valorLiquido)}</td>
          </tr>
        </tfoot>
      </table>

      <p class="fgts">FGTS do mês (depósito do empregador): ${formatarBRL(encargosDoLancamento(d.detalhe).fgts)}</p>

      <p class="assinatura">Recebi a importância líquida discriminada neste demonstrativo.</p>
      <div class="linha-assinatura"></div>
    </section>`;
}

const ESTILO = `
  body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #111; margin: 0; padding: 16px; }
  .holerite { border: 1px solid #ccc; border-radius: 6px; padding: 16px; margin-bottom: 16px; page-break-inside: avoid; }
  .holerite + .holerite { page-break-before: always; }
  header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #02AB3D; padding-bottom: 8px; }
  header h2 { margin: 0 0 2px; font-size: 15px; }
  header p { margin: 0; font-size: 11px; color: #555; }
  .comp { text-align: right; text-transform: capitalize; }
  table { width: 100%; border-collapse: collapse; }
  .ident { margin: 12px 0; }
  .ident td { width: 33%; padding: 4px 6px; border: 1px solid #e5e5e5; }
  .ident span { display: block; font-size: 10px; color: #666; text-transform: uppercase; }
  .rubricas th, .rubricas td { border: 1px solid #e5e5e5; padding: 5px 6px; }
  .rubricas th { background: #f6f6f6; text-align: left; font-size: 11px; }
  .rubricas .r { text-align: right; } .rubricas .c { text-align: center; }
  tfoot td { font-weight: bold; background: #fafafa; }
  tfoot .liquido td { background: #0B0F0D; color: #fff; }
  .fgts { margin-top: 8px; font-size: 11px; color: #555; }
  .assinatura { margin-top: 24px; font-size: 11px; color: #555; }
  .linha-assinatura { margin-top: 28px; border-top: 1px solid #333; width: 60%; }
  @page { size: portrait; margin: 12mm; }
`;

export function holeriteDocumento(titulo: string, itens: HoleriteDados[]): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8" />
  <title>${esc(titulo)}</title><style>${ESTILO}</style></head>
  <body>${itens.map(holeriteHtml).join("")}</body></html>`;
}

/** Abre a janela de impressão com um ou mais demonstrativos. */
export function imprimirHolerite(titulo: string, itens: HoleriteDados[]): boolean {
  if (!itens.length) return false;
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.write(holeriteDocumento(titulo, itens));
  win.document.close();
  setTimeout(() => win.print(), 300);
  return true;
}
