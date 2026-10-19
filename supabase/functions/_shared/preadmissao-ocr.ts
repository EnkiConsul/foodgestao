/**
 * Leitura automática dos documentos enviados pelo candidato na Pré-Admissão.
 *
 * Só SUGERE valores: nada é gravado aqui. A ficha preenche apenas campos em
 * branco e o candidato confere antes de enviar; o servidor revalida tudo no
 * salvamento normal. Cada documento tem a sua lista fechada de campos.
 */
import { AI_URL, OCR_MODEL } from "./doc-bulk-ocr.ts";

export const CAMPOS_POR_DOCUMENTO: Record<string, Record<string, string>> = {
  identidade: {
    nome: "nome completo da pessoa",
    cpf: "CPF (só números)",
    data_nascimento: "data de nascimento (AAAA-MM-DD)",
    nome_mae: "nome da mãe (filiação)",
    nome_pai: "nome do pai (filiação), se houver",
    naturalidade: "cidade onde nasceu",
    naturalidade_uf: "UF onde nasceu (2 letras)",
    nacionalidade: "nacionalidade (ex.: BRASILEIRA)",
    rg_numero: "número do RG / registro geral (não usar o número da CNH)",
    rg_orgao: "órgão emissor do RG (ex.: SSP)",
    rg_uf: "UF emissora do RG (2 letras)",
    rg_emissao: "data de expedição do RG (AAAA-MM-DD)",
  },
  comprovante_endereco: {
    cep: "CEP do endereço do cliente (8 números)",
    endereco: "logradouro (rua/avenida) do cliente, sem número",
    numero: "número do imóvel",
    complemento: "complemento (apto, bloco, quadra/lote)",
    bairro: "bairro",
    cidade: "cidade",
    uf: "UF (2 letras)",
  },
  ctps: {
    pis: "PIS/PASEP/NIT/NIS (só números)",
    ctps_numero: "número da carteira de trabalho (na digital é o CPF)",
    ctps_serie: "série da carteira física (vazio se digital)",
    ctps_uf: "UF da carteira física (vazio se digital)",
    ctps_expedicao: "data de expedição da carteira física (AAAA-MM-DD)",
  },
  titulo_eleitor: {
    titulo_eleitor: "número de inscrição do título (só números)",
    titulo_zona: "zona eleitoral",
    titulo_secao: "seção eleitoral",
  },
  reservista: {
    reservista: "número do certificado de reservista",
    reservista_categoria: "categoria da reservista",
  },
};

export const CODIGOS_LEITURA = Object.keys(CAMPOS_POR_DOCUMENTO);

const DATA = new Set(["data_nascimento", "rg_emissao", "ctps_expedicao"]);
const SO_NUMEROS = new Set(["cpf", "pis", "cep", "titulo_eleitor"]);
const UF = new Set(["naturalidade_uf", "rg_uf", "uf", "ctps_uf"]);

/** Normaliza e descarta o que não tem o formato esperado. */
export function limparCampos(codigo: string, bruto: Record<string, unknown>): Record<string, string> {
  const permitidos = CAMPOS_POR_DOCUMENTO[codigo] ?? {};
  const out: Record<string, string> = {};
  for (const campo of Object.keys(permitidos)) {
    let v = String(bruto?.[campo] ?? "").trim();
    if (!v || /^(desconhecid|nao|não|n\/a|null|-)/i.test(v) && v.length < 14) continue;
    if (DATA.has(campo)) {
      const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
      if (br) v = `${br[3]}-${br[2]}-${br[1]}`;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) continue;
    } else if (SO_NUMEROS.has(campo)) {
      v = v.replace(/\D/g, "");
      if (campo === "cpf" && v.length !== 11) continue;
      if (campo === "cep" && v.length !== 8) continue;
      if (!v) continue;
    } else if (UF.has(campo)) {
      v = v.toUpperCase();
      if (!/^[A-Z]{2}$/.test(v)) continue;
    } else {
      v = v.toLocaleUpperCase("pt-BR").slice(0, 160);
    }
    out[campo] = v;
  }
  return out;
}

export type ArquivoLeitura = { mime: string; base64: string };

/** Chama a leitura com os arquivos do documento (frente, verso…). */
export async function lerDocumento(
  apiKey: string,
  codigo: string,
  arquivos: ArquivoLeitura[],
): Promise<{ ok: true; campos: Record<string, string> } | { ok: false; status: number }> {
  const campos = CAMPOS_POR_DOCUMENTO[codigo];
  const lista = Object.entries(campos).map(([k, d]) => `- "${k}": ${d}`).join("\n");
  const prompt =
    `Você lê documentos brasileiros para pré-preencher uma ficha de admissão. ` +
    `Responda SOMENTE com um objeto JSON com exatamente estas chaves (use "" quando não constar ou estiver ilegível; nunca invente):\n${lista}\n` +
    `Datas no formato AAAA-MM-DD. Não use dados da empresa emissora, só da pessoa/cliente.`;
  const partes: unknown[] = [{ type: "text", text: prompt }];
  arquivos.forEach((a, i) => {
    if (a.mime === "application/pdf") {
      partes.push({ type: "file", file: { filename: `doc-${i + 1}.pdf`, file_data: `data:application/pdf;base64,${a.base64}` } });
    } else {
      partes.push({ type: "image_url", image_url: { url: `data:${a.mime};base64,${a.base64}` } });
    }
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45_000);
  try {
    const r = await fetch(AI_URL, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model: OCR_MODEL,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: partes }],
      }),
    });
    if (!r.ok) return { ok: false, status: r.status };
    const j = await r.json();
    const texto = String(j?.choices?.[0]?.message?.content ?? "");
    const ini = texto.indexOf("{");
    const fim = texto.lastIndexOf("}");
    if (ini < 0 || fim <= ini) return { ok: true, campos: {} };
    const obj = JSON.parse(texto.slice(ini, fim + 1));
    return { ok: true, campos: limparCampos(codigo, obj) };
  } catch {
    return { ok: false, status: 504 };
  } finally {
    clearTimeout(timer);
  }
}
