/**
 * Data do pagamento informada ao anexar o comprovante.
 * Vazia é aceita (campo opcional); data futura é recusada.
 */
export type DataPagamentoValida = { ok: true; valor: string | null; motivo?: undefined };
export type DataPagamentoInvalida = { ok: false; valor?: undefined; motivo: string };

export function validarDataPagamento(
  valor: string,
  hoje: string = new Date().toISOString().slice(0, 10),
): DataPagamentoValida | DataPagamentoInvalida {
  const v = (valor ?? "").trim();
  if (!v) return { ok: true, valor: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return { ok: false, motivo: "Informe uma data válida." };
  if (Number.isNaN(new Date(`${v}T00:00:00`).getTime())) {
    return { ok: false, motivo: "Informe uma data válida." };
  }
  if (v > hoje) return { ok: false, motivo: "A data do pagamento não pode ser futura." };
  return { ok: true, valor: v };
}

/** Hoje no formato aceito pelo campo de data (limite máximo). */
export function hojeISO(base: Date = new Date()): string {
  const off = base.getTimezoneOffset() * 60000;
  return new Date(base.getTime() - off).toISOString().slice(0, 10);
}

// ------------------------------------------------------------------
// Conferência de competência
// ------------------------------------------------------------------

/**
 * A competência chega na tela como "MM/AAAA" (ou "—" quando não há).
 * Devolve "AAAA-MM" para comparar com a data do pagamento.
 */
export function competenciaParaAnoMes(competencia?: string | null): string | null {
  const m = /^(\d{2})\/(\d{4})$/.exec((competencia ?? "").trim());
  if (!m) return null;
  const mes = Number(m[1]);
  if (mes < 1 || mes > 12) return null;
  return `${m[2]}-${m[1]}`;
}

/**
 * Verdadeiro quando o pagamento informado está em um mês diferente da
 * competência do documento — nesse caso a tela pede confirmação antes de
 * anexar (o servidor também recusa sem confirmação).
 */
export function competenciaDivergente(
  pagoEm?: string | null,
  competencia?: string | null,
): boolean {
  const anoMes = competenciaParaAnoMes(competencia);
  const data = (pagoEm ?? "").trim();
  if (!anoMes || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  return data.slice(0, 7) !== anoMes;
}

/** Frase de aviso da divergência, em linguagem de negócio. */
export function avisoCompetenciaDivergente(pagoEm: string, competencia: string): string {
  const [ano, mes] = pagoEm.split("-");
  return `O pagamento informado é de ${mes}/${ano} e o documento é da competência ${competencia}. Confirme se o comprovante é mesmo deste documento.`;
}

// ------------------------------------------------------------------
// Data lida do próprio comprovante
// ------------------------------------------------------------------

export type DataSugerida = {
  valor: string | null;
  /** De onde veio a sugestão: texto do arquivo ou nome do arquivo. */
  origem: "arquivo" | "nome" | null;
};

const MESES: Record<string, string> = {
  jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
  jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
};

function valida(ano: string, mes: string, dia: string, hoje: string): string | null {
  const iso = `${ano}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
  const check = validarDataPagamento(iso, hoje);
  if (!check.ok || !check.valor) return null;
  const d = new Date(`${iso}T12:00:00Z`);
  if (d.getUTCMonth() + 1 !== Number(mes) || d.getUTCDate() !== Number(dia)) return null;
  return iso;
}

/**
 * Procura a data da transação em um texto (conteúdo ou nome do arquivo).
 * Aceita 15/09/2026, 15-09-2026, 2026-09-15, 20260915 e "15 de setembro de 2026"
 * (abreviado). Datas futuras ou impossíveis são ignoradas.
 */
export function extrairDataDoTexto(
  texto: string,
  hoje: string = hojeISO(),
): string | null {
  const t = (texto ?? "").toLowerCase();

  const padroes: Array<{ re: RegExp; ler: (m: RegExpExecArray) => [string, string, string] }> = [
    { re: /(\d{4})-(\d{2})-(\d{2})/g, ler: (m) => [m[1], m[2], m[3]] },
    { re: /(\d{2})[/.\-](\d{2})[/.\-](\d{4})/g, ler: (m) => [m[3], m[2], m[1]] },
    {
      re: /(\d{1,2})\s*de\s*([a-zç]{3})[a-zç]*\.?\s*de\s*(\d{4})/g,
      ler: (m) => [m[3], MESES[m[2]] ?? "", m[1]],
    },
    { re: /(?<!\d)(20\d{2})(\d{2})(\d{2})(?!\d)/g, ler: (m) => [m[1], m[2], m[3]] },
  ];

  for (const { re, ler } of padroes) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t)) !== null) {
      const [ano, mes, dia] = ler(m);
      if (!mes) continue;
      const iso = valida(ano, mes, dia, hoje);
      if (iso) return iso;
    }
  }
  return null;
}

function lerComoTexto(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    try {
      const leitor = new FileReader();
      leitor.onload = () => resolve(String(leitor.result ?? ""));
      leitor.onerror = () => resolve("");
      leitor.readAsText(blob);
    } catch {
      resolve("");
    }
  });
}

/** Texto legível de um arquivo (PDF com camada de texto, imagem sem OCR). */
async function textoDoArquivo(file: File): Promise<string> {
  const limite = 2 * 1024 * 1024;
  const parte = typeof file.slice === "function" ? file.slice(0, limite) : file;
  try {
    if (typeof (parte as Blob).arrayBuffer === "function") {
      const buf = await (parte as Blob).arrayBuffer();
      return new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(buf));
    }
  } catch {
    // arquivo ilegível: a sugestão cai para o nome do arquivo
  }
  return await lerComoTexto(parte);
}

/**
 * Sugere a data do pagamento lida do próprio comprovante: primeiro o texto do
 * arquivo, depois o nome do arquivo. A sugestão é sempre conferida por quem
 * está anexando — nada é gravado automaticamente.
 */
export async function sugerirDataPagamento(
  file: File,
  hoje: string = hojeISO(),
): Promise<DataSugerida> {
  const doConteudo = extrairDataDoTexto(await textoDoArquivo(file), hoje);
  if (doConteudo) return { valor: doConteudo, origem: "arquivo" };
  const doNome = extrairDataDoTexto(file.name ?? "", hoje);
  if (doNome) return { valor: doNome, origem: "nome" };
  return { valor: null, origem: null };
}
