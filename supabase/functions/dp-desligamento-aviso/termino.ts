/**
 * Guarda do término antecipado por novo emprego (Súmula 276 TST).
 * O servidor só antecipa com as duas declarações explícitas do gestor e uma
 * nota de evidência (onde está o pedido e o comprovante: GED/contabilidade).
 * O último dia trabalhado não pode ser futuro. A declaração do gestor não é
 * prova jurídica: a evidência deve existir fora do sistema.
 */
export type TerminoNovoEmprego = {
  tipo: string;
  data: string;
  nota?: string;
  aplicar_termino?: boolean;
  pedido_dispensado_pelo_empregado?: boolean;
  novo_emprego_comprovado?: boolean;
};

export function validarTerminoNovoEmprego(b: TerminoNovoEmprego, hoje: string): string | null {
  if (b.aplicar_termino !== true) return null;
  if (b.tipo !== "novo_emprego") return "Término antecipado automático só para novo emprego comprovado.";
  if (b.pedido_dispensado_pelo_empregado !== true || b.novo_emprego_comprovado !== true)
    return "Confirme as duas declarações: pedido escrito do colaborador e comprovação do novo emprego.";
  if ((b.nota ?? "").trim().length < 20)
    return "Descreva como e quando houve o pedido e a comprovação (mínimo 20 caracteres).";
  if (b.data > hoje) return "O último dia trabalhado não pode ser futuro: registre depois que ele ocorrer.";
  return null;
}
