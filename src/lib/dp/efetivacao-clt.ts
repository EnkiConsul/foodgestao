// ------------------------------------------------------------------
// Efetivação de vínculo sem registro (freelancer/PJ/MEI) para CLT:
// lista o que falta no cadastro para o registro em carteira e lembretes
// de encerramento do vínculo anterior. Nunca bloqueia — só orienta.
// ------------------------------------------------------------------
import { exigeNovoContrato, regimeFormalizado } from "@/lib/dp/contrato-policy";

export interface CadastroEfetivacao {
  cpf?: string | null;
  data_nascimento?: string | null;
  sexo?: string | null;
  rg_numero?: string | null;
  pis_nit?: string | null;
  ctps_numero?: string | null;
  ctps_serie?: string | null;
  titulo_eleitor?: string | null;
  reservista?: string | null;
  grau_instrucao?: string | null;
  endereco?: unknown;
  banco_codigo?: string | null;
}

export interface PendenciaEfetivacao {
  campo: string;
  rotulo: string;
}

const vazio = (v: unknown) => v == null || String(v).trim() === "";

/** É efetivação (sem registro → com registro)? */
export function ehEfetivacaoClt(de?: string | null, para?: string | null): boolean {
  return exigeNovoContrato(de ?? null, para ?? null) && regimeFormalizado(para ?? null);
}

/** Dados exigidos para o registro CLT que ainda não estão no cadastro. */
export function pendenciasEfetivacao(c: CadastroEfetivacao): PendenciaEfetivacao[] {
  const itens: PendenciaEfetivacao[] = [];
  const add = (ok: boolean, campo: string, rotulo: string) => {
    if (!ok) itens.push({ campo, rotulo });
  };
  add(!vazio(c.cpf), "cpf", "CPF");
  add(!vazio(c.data_nascimento), "data_nascimento", "Data de nascimento");
  add(!vazio(c.rg_numero), "rg_numero", "RG");
  add(!vazio(c.pis_nit), "pis_nit", "PIS/PASEP/NIT");
  add(!vazio(c.ctps_numero), "ctps_numero", "CTPS (número)");
  add(!vazio(c.titulo_eleitor), "titulo_eleitor", "Título de eleitor");
  add(!vazio(c.grau_instrucao), "grau_instrucao", "Grau de instrução");
  const end = (c.endereco ?? {}) as Record<string, unknown>;
  add(!vazio(end.cep) && !vazio(end.logradouro), "endereco", "Endereço completo");
  if (String(c.sexo ?? "").toUpperCase().startsWith("M")) {
    add(!vazio(c.reservista), "reservista", "Certificado de reservista");
  }
  return itens;
}

/** Lembretes fixos da efetivação, exibidos junto com as pendências. */
export const LEMBRETES_EFETIVACAO = [
  "Quite diárias e recibos do vínculo anterior até a véspera da data de vigência.",
  "Agende o exame admissional (ASO) antes do início como CLT.",
  "Gere e colete a assinatura do contrato de trabalho após salvar.",
];
