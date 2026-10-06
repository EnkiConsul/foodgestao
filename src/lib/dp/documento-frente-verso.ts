/** Documentos com foto que normalmente têm frente e verso. */
const PADRAO =
  /\b(rg|cnh|rne|rnm|crnm|passaporte|identidade|identifica[cç][aã]o|habilita[cç][aã]o|habilita|conselho|crm|coren|crn|crea|oab|ctps|carteira|doc(umento)?\.? com foto)\b/i;
const DOIS_LADOS = /(frente\s*e\s*verso|dois lados|ambos os lados)/i;

export function exigeFrenteVerso(nome?: string | null, descricao?: string | null): boolean {
  const n = nome ?? "";
  const d = descricao ?? "";
  return PADRAO.test(n) || DOIS_LADOS.test(n) || DOIS_LADOS.test(d);
}
