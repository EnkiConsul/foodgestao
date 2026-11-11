/**
 * Quem participa da escolha mensal de folga de fim de semana: CLT (exceto
 * intermitente) e freelancer mensalista. Sócio fica fora. Mesmo critério de
 * `dp_folga_exige_descanso_fds` no banco. Quem está em 12x36 também fica fora:
 * o ciclo de 48h já alterna os domingos de descanso (Art. 59-A da CLT).
 */
export function podeEscolherFolgaFds(
  regime?: string | null,
  formaPagamento?: string | null,
  vinculoLabel?: string | null,
  escalaModelo?: string | null,
): boolean {
  if (escalaModelo === "12x36") return false;
  const vinculo = String(vinculoLabel ?? "").toLowerCase();
  if (vinculo === "socio" || vinculo === "sócio") return false;
  const r = String(regime ?? "").toLowerCase();
  if (r === "freelancer") return String(formaPagamento ?? "").toLowerCase() === "mensalista";
  return r === "clt";
}
