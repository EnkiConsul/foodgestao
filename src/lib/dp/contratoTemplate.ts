/**
 * Modelos de contrato de trabalho e ficha de registro gerados pelo sistema.
 * O HTML é imprimível e serve de base para o aceite eletrônico (hash + log).
 */

export const MODELO_VERSAO = "v1";

export type ContratoContexto = {
  empresa: { nome: string; cnpj?: string | null; endereco?: string | null };
  colaborador: {
    nome: string;
    cpf?: string | null;
    pis_nit?: string | null;
    data_nascimento?: string | null;
    estado_civil?: string | null;
    endereco?: string | null;
    cargo?: string | null;
    unidade?: string | null;
    data_admissao?: string | null;
    salario?: number | null;
    regime?: string | null;
    jornada?: string | null;
    matricula?: string | null;
  };
};

const dt = (iso?: string | null) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("pt-BR") : "—";

const moeda = (v?: number | null) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const esc = (s?: string | null) =>
  (s ?? "—").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));

function wrapper(titulo: string, corpo: string) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" />
<title>${esc(titulo)}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;color:#111;max-width:800px;margin:24px auto;line-height:1.5}
  h1{font-size:18px;text-align:center;margin-bottom:24px}
  h2{font-size:14px;margin:20px 0 8px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  td{border:1px solid #ccc;padding:6px}
  td.k{background:#f5f5f5;width:32%;font-weight:bold}
  p{font-size:13px;text-align:justify}
  .rodape{margin-top:32px;font-size:11px;color:#555}
</style></head><body>${corpo}</body></html>`;
}

export function montarFichaRegistroHtml(ctx: ContratoContexto): string {
  const { empresa: e, colaborador: c } = ctx;
  return wrapper(
    "Ficha de Registro de Empregado",
    `<h1>FICHA DE REGISTRO DE EMPREGADO</h1>
<h2>Empregador</h2>
<table>
  <tr><td class="k">Razão social</td><td>${esc(e.nome)}</td></tr>
  <tr><td class="k">CNPJ</td><td>${esc(e.cnpj)}</td></tr>
  <tr><td class="k">Endereço</td><td>${esc(e.endereco)}</td></tr>
</table>
<h2>Empregado</h2>
<table>
  <tr><td class="k">Nome</td><td>${esc(c.nome)}</td></tr>
  <tr><td class="k">CPF</td><td>${esc(c.cpf)}</td></tr>
  <tr><td class="k">PIS/NIT</td><td>${esc(c.pis_nit)}</td></tr>
  <tr><td class="k">Data de nascimento</td><td>${dt(c.data_nascimento)}</td></tr>
  <tr><td class="k">Estado civil</td><td>${esc(c.estado_civil)}</td></tr>
  <tr><td class="k">Endereço</td><td>${esc(c.endereco)}</td></tr>
  <tr><td class="k">Matrícula</td><td>${esc(c.matricula)}</td></tr>
</table>
<h2>Contrato</h2>
<table>
  <tr><td class="k">Cargo</td><td>${esc(c.cargo)}</td></tr>
  <tr><td class="k">Unidade</td><td>${esc(c.unidade)}</td></tr>
  <tr><td class="k">Admissão</td><td>${dt(c.data_admissao)}</td></tr>
  <tr><td class="k">Regime</td><td>${esc(c.regime)}</td></tr>
  <tr><td class="k">Remuneração</td><td>${moeda(c.salario)}</td></tr>
  <tr><td class="k">Jornada</td><td>${esc(c.jornada)}</td></tr>
</table>
<p class="rodape">Documento gerado eletronicamente pela plataforma 360°FOOD (modelo ${MODELO_VERSAO}). O aceite eletrônico do empregado é registrado com data, hora, IP e identificação do dispositivo.</p>`,
  );
}

export function montarContratoHtml(ctx: ContratoContexto): string {
  const { empresa: e, colaborador: c } = ctx;
  return wrapper(
    "Contrato de Trabalho",
    `<h1>CONTRATO INDIVIDUAL DE TRABALHO</h1>
<p><strong>Empregador:</strong> ${esc(e.nome)}, CNPJ ${esc(e.cnpj)}, com endereço em ${esc(e.endereco)}.</p>
<p><strong>Empregado:</strong> ${esc(c.nome)}, CPF ${esc(c.cpf)}, PIS/NIT ${esc(c.pis_nit)}, residente em ${esc(c.endereco)}.</p>
<h2>Cláusula 1 — Função e local de trabalho</h2>
<p>O empregado é admitido para exercer a função de <strong>${esc(c.cargo)}</strong>, na unidade ${esc(c.unidade)}, a partir de ${dt(c.data_admissao)}.</p>
<h2>Cláusula 2 — Remuneração</h2>
<p>A remuneração ajustada é de ${moeda(c.salario)}, paga nos prazos legais, acrescida dos adicionais e benefícios previstos em norma coletiva e na política interna.</p>
<h2>Cláusula 3 — Jornada de trabalho</h2>
<p>A jornada contratada é: ${esc(c.jornada)}, respeitados os limites legais, intervalos e o descanso semanal remunerado.</p>
<h2>Cláusula 4 — Regime de contratação</h2>
<p>O vínculo observa o regime <strong>${esc(c.regime)}</strong> e a legislação aplicável, inclusive as normas coletivas da categoria.</p>
<h2>Cláusula 5 — Obrigações do empregado</h2>
<p>O empregado se obriga a cumprir as normas internas, zelar pelos bens da empresa, usar os equipamentos de proteção fornecidos e manter atualizados os documentos exigidos para a função.</p>
<h2>Cláusula 6 — Aceite eletrônico</h2>
<p>As partes reconhecem a validade do aceite eletrônico deste instrumento, registrado na plataforma com data, hora, endereço IP e identificação do dispositivo, nos termos do art. 10, §2º, da MP 2.200-2/2001.</p>
<p class="rodape">Documento gerado eletronicamente pela plataforma 360°FOOD (modelo ${MODELO_VERSAO}).</p>`,
  );
}

/** SHA-256 do conteúdo, usado como prova de integridade do aceite. */
export async function hashConteudo(conteudo: string): Promise<string> {
  const bytes = new TextEncoder().encode(conteudo);
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
