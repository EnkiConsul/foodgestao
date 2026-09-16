// ------------------------------------------------------------------
// Domínio: DP → Ficha de registro (anexo recortado)
//
// Regra dura: o colaborador só pode receber as páginas dele. O lote é um PDF
// com várias pessoas, então anexar o arquivo do lote está proibido. Sem recorte
// possível, o cadastro segue válido e o anexo é reportado como não anexado.
//
// O anexo acontece fora da transação do cadastro. Por isso o resultado do
// cadastro JAMAIS depende dele e a repetição do anexo é sempre permitida:
// destino determinístico + verificação prévia = nenhum cadastro novo, nenhum
// documento duplicado.
// ------------------------------------------------------------------

import { recortarPaginasPdf, RecorteInvalidoError } from "@/lib/dp/ficha-registro/recortarPaginas";

export type AnexoFichaStatus =
  | "nao_solicitado"
  | "anexado"
  | "ja_anexado"
  | "sem_paginas"
  | "falhou";

export interface AnexoFichaResultado {
  status: AnexoFichaStatus;
  /** Motivo legível quando não foi anexado. */
  motivo?: string;
  destino?: string;
}

/** Portas de infraestrutura — o domínio não conhece Storage nem banco. */
export interface AnexoFichaPorts {
  baixarLote: (path: string) => Promise<ArrayBuffer | Uint8Array>;
  enviarRecorte: (destino: string, pdf: Uint8Array) => Promise<{ error?: { message?: string } | null }>;
  documentoExistente: (destino: string) => Promise<boolean>;
  registrarDocumento: (input: { destino: string; descricao: string }) => Promise<{ error?: { message?: string } | null }>;
}

export interface AnexoFichaInput {
  companyId: string;
  colaboradorId: string;
  itemId: string;
  arquivoPath: string | null;
  paginaInicio: number | null;
  paginaFim: number | null;
}

export function destinoAnexoFicha(companyId: string, colaboradorId: string, itemId: string): string {
  return `${companyId}/${colaboradorId}/ficha-registro-${itemId}.pdf`;
}

export function descricaoPaginas(inicio: number, fim: number): string {
  const faixa = fim !== inicio ? `páginas ${inicio} a ${fim}` : `página ${inicio}`;
  return `Recorte da ficha importada (${faixa} do lote).`;
}

export async function anexarFichaRecorte(
  input: AnexoFichaInput,
  ports: AnexoFichaPorts,
): Promise<AnexoFichaResultado> {
  if (!input.arquivoPath) {
    return { status: "sem_paginas", motivo: "O arquivo do lote não está disponível." };
  }
  if (input.paginaInicio == null) {
    return { status: "sem_paginas", motivo: "A ficha não indica as páginas do colaborador." };
  }

  const destino = destinoAnexoFicha(input.companyId, input.colaboradorId, input.itemId);
  try {
    if (await ports.documentoExistente(destino)) {
      return { status: "ja_anexado", destino };
    }

    const lote = await ports.baixarLote(input.arquivoPath);
    const inicio = input.paginaInicio;
    const fim = input.paginaFim ?? inicio;
    const recorte = await recortarPaginasPdf(lote, { inicio, fim });

    const envio = await ports.enviarRecorte(destino, recorte);
    const jaNoDestino = !!envio.error && /exist/i.test(envio.error.message ?? "");
    if (envio.error && !jaNoDestino) {
      return { status: "falhou", motivo: envio.error.message ?? "Falha ao enviar o recorte.", destino };
    }

    const reg = await ports.registrarDocumento({ destino, descricao: descricaoPaginas(inicio, fim) });
    if (reg.error) {
      return { status: "falhou", motivo: reg.error.message ?? "Falha ao registrar o documento.", destino };
    }
    return { status: "anexado", destino };
  } catch (e) {
    if (e instanceof RecorteInvalidoError) {
      return { status: "sem_paginas", motivo: e.motivo, destino };
    }
    return { status: "falhou", motivo: e instanceof Error ? e.message : "Falha ao anexar a ficha.", destino };
  }
}
