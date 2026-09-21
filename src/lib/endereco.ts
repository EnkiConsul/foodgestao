/**
 * Endereço em um só lugar: lista de UF, máscara de CEP e consulta pelo CEP.
 *
 * Antes cada formulário repetia a máscara e a lista de estados, e nenhum deles
 * preenchia rua/bairro/cidade a partir do CEP. Agora todos usam estas funções.
 */
import { isHomologacao } from "@/lib/env/appEnv";
import { cepFixture } from "@/lib/env/homologacaoFixtures";


export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

export type Uf = (typeof UFS)[number];

/** Valor gravado quando o endereço não tem número. */
export const SEM_NUMERO = "S/N";

export function maskCep(valor: string): string {
  const d = valor.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

export function cepDigitos(valor: string | null | undefined): string {
  return String(valor ?? "").replace(/\D/g, "").slice(0, 8);
}

export function cepCompleto(valor: string | null | undefined): boolean {
  return cepDigitos(valor).length === 8;
}

export interface EnderecoConsultado {
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
}

const cache = new Map<string, EnderecoConsultado | null>();

/**
 * Consulta pública de CEP (ViaCEP). Devolve `null` quando o CEP não existe ou
 * a consulta falha — o preenchimento manual continua liberado nos dois casos.
 */
export async function consultarCep(valor: string): Promise<EnderecoConsultado | null> {
  const cep = cepDigitos(valor);
  if (cep.length !== 8) return null;
  if (cache.has(cep)) return cache.get(cep) ?? null;
  // Homologação: resposta determinística e fictícia, sem nenhuma transmissão
  // ao provedor externo.
  if (isHomologacao()) {
    const fixo = cepFixture(cep);
    cache.set(cep, fixo);
    return fixo;
  }
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    if (!r.ok) return null;
    const j = (await r.json()) as Record<string, unknown>;
    if (j.erro) {
      cache.set(cep, null);
      return null;
    }
    const achado: EnderecoConsultado = {
      logradouro: String(j.logradouro ?? ""),
      bairro: String(j.bairro ?? ""),
      cidade: String(j.localidade ?? ""),
      uf: String(j.uf ?? "").toUpperCase(),
    };
    cache.set(cep, achado);
    return achado;
  } catch {
    return null;
  }
}
