/**
 * Leitura automática do comprovante de pagamento.
 *
 * Primeiro tenta o servidor (`dp-comprovante-ler`), que entende PDF, foto e
 * print de tela de aplicativo de banco. Se a leitura não estiver disponível,
 * cai para a leitura local do texto do arquivo e do nome do arquivo.
 *
 * O resultado é SEMPRE sugestão: quem anexa confere na tela, e a gravação é
 * validada de novo pelo banco.
 */
import { supabase } from "@/integrations/supabase/client";
import { hojeISO, sugerirDataPagamento } from "@/lib/dp/comprovante-data";

export type LeituraComprovante = {
  pagoEm: string | null;
  valorCents: number | null;
  operacao: string | null;
  instituicao: string | null;
  /** Nome de quem recebeu o pagamento, quando legível. */
  favorecido: string | null;
  /** De onde veio a sugestão da data. */
  origem: "ia" | "arquivo" | "nome" | null;
  /** Resposta estruturada do servidor, guardada junto com o comprovante. */
  bruto: unknown;
};

const VAZIO: LeituraComprovante = {
  pagoEm: null,
  valorCents: null,
  operacao: null,
  instituicao: null,
  favorecido: null,
  origem: null,
  bruto: null,
};

/** Arquivo em base64 sem o prefixo "data:". */
async function base64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

const MAX_BYTES = 15 * 1024 * 1024;

export async function lerComprovante(file: File): Promise<LeituraComprovante> {
  const hoje = hojeISO();

  if (file.size <= MAX_BYTES) {
    try {
      const { data, error } = await supabase.functions.invoke("dp-comprovante-ler", {
        body: {
          mime_type: file.type || "application/octet-stream",
          nome: file.name,
          arquivo_base64: await base64(file),
        },
      });
      const corpo = data as
        | {
          lido?: boolean;
          pago_em?: string | null;
          valor_cents?: number | null;
          operacao?: string | null;
          instituicao?: string | null;
          favorecido_nome?: string | null;
        }
        | null;
      if (!error && corpo?.lido) {
        const pagoEm = corpo.pago_em && corpo.pago_em <= hoje ? corpo.pago_em : null;
        if (pagoEm || corpo.valor_cents || corpo.favorecido_nome) {
          return {
            pagoEm,
            valorCents: corpo.valor_cents ?? null,
            operacao: corpo.operacao ?? null,
            instituicao: corpo.instituicao ?? null,
            favorecido: corpo.favorecido_nome ?? null,
            origem: pagoEm ? "ia" : null,
            bruto: corpo,
          };
        }
      }
    } catch {
      // leitura automática indisponível: segue com a leitura local
    }
  }

  const local = await sugerirDataPagamento(file, hoje);
  if (local.valor) {
    return { ...VAZIO, pagoEm: local.valor, origem: local.origem };
  }
  return VAZIO;
}

/** Frase curta do que foi lido, para a tela. */
export function frasesLeitura(leitura: LeituraComprovante): string | null {
  if (!leitura.origem && !leitura.valorCents) return null;
  const partes: string[] = [];
  if (leitura.origem === "ia") partes.push("Data lida do comprovante pelo sistema");
  else if (leitura.origem === "arquivo") partes.push("Data lida do arquivo");
  else if (leitura.origem === "nome") partes.push("Data lida do nome do arquivo");
  if (leitura.valorCents) {
    partes.push(
      `valor lido ${(leitura.valorCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
    );
  }
  if (leitura.operacao) partes.push(`operação ${leitura.operacao.toUpperCase()}`);
  return `${partes.join(" · ")} — confira antes de importar.`;
}
