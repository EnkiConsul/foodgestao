/**
 * Contatos de emergência do colaborador: 1 obrigatório, até 2. Na pré-admissão
 * ficam em campos simples (emerg1_*, emerg2_*); no cadastro, em lista.
 */
export const PARENTESCOS_EMERGENCIA = [
  { value: "mae", label: "Mãe" },
  { value: "pai", label: "Pai" },
  { value: "conjuge", label: "Cônjuge / Companheiro(a)" },
  { value: "irmao", label: "Irmão(ã)" },
  { value: "filho", label: "Filho(a)" },
  { value: "outro_familiar", label: "Outro familiar" },
  { value: "amigo", label: "Amigo(a)" },
];

export type ContatoEmergencia = { nome: string; parentesco: string; whatsapp: string };

export const rotuloParentescoEmergencia = (v?: string | null) =>
  PARENTESCOS_EMERGENCIA.find((p) => p.value === v)?.label ?? (v ?? "");

const digitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

export function contatoValido(c: Partial<ContatoEmergencia> | null | undefined): boolean {
  if (!c) return false;
  const n = digitos(c.whatsapp).length;
  return String(c.nome ?? "").trim().length >= 3 && !!String(c.parentesco ?? "").trim() && n >= 10 && n <= 13;
}

/** Lista válida para gravar: 1 a 2 contatos completos. */
export function contatosValidos(lista: Array<Partial<ContatoEmergencia>>): boolean {
  const preenchidos = lista.filter((c) => c && (c.nome || c.whatsapp || c.parentesco));
  return preenchidos.length >= 1 && preenchidos.length <= 2 && preenchidos.every(contatoValido);
}

/**
 * Converte os campos da pré-admissão em lista. O antigo "WhatsApp de recado"
 * NÃO vira contato de emergência: não tem nome nem parentesco e muitas vezes
 * é o próprio número do candidato. Fichas antigas ficam sem contato e o
 * colaborador informa os reais na confirmação do portal.
 */
export function contatosDaFicha(d: Record<string, unknown>): ContatoEmergencia[] {
  const out: ContatoEmergencia[] = [];
  for (const i of [1, 2]) {
    const c = {
      nome: String(d[`emerg${i}_nome`] ?? "").trim(),
      parentesco: String(d[`emerg${i}_parentesco`] ?? "").trim(),
      whatsapp: digitos(d[`emerg${i}_whatsapp`]),
    };
    if (c.nome || c.whatsapp) out.push(c);
  }
  return out;
}

export const DIAS_CONFIRMACAO = 180;

/** Precisa confirmar: nunca confirmou, venceu 180 dias ou o DP pediu de novo. */
export function confirmacaoVencida(
  confirmadoEm: string | null | undefined,
  solicitadoEm?: string | null,
  agora: Date = new Date(),
): boolean {
  if (solicitadoEm) return true;
  if (!confirmadoEm) return true;
  const t = new Date(confirmadoEm).getTime();
  if (!Number.isFinite(t)) return true;
  return agora.getTime() - t > DIAS_CONFIRMACAO * 86400000;
}
