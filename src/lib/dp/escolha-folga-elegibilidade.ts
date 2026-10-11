/**
 * Quem participa da escolha mensal de folga de fim de semana: CLT (exceto
 * intermitente) e freelancer mensalista. Sócio fica fora. Mesmo critério de
 * `dp_folga_exige_descanso_fds` no banco.
 */
export function podeEscolherFolgaFds(
  regime?: string | null,
  formaPagamento?: string | null,
  vinculoLabel?: string | null,
): boolean {
  const vinculo = String(vinculoLabel ?? "").toLowerCase();
  if (vinculo === "socio" || vinculo === "sócio") return false;
  const r = String(regime ?? "").toLowerCase();
  if (r === "freelancer") return String(formaPagamento ?? "").toLowerCase() === "mensalista";
  return r === "clt";
}
