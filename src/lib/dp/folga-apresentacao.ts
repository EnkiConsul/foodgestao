/** Identidade persistida, nunca inferência a partir de observações livres. */
export function rotuloFolga(f: { tipo?: string | null; extra?: boolean | null; direito_origem?: string | null; subtipo?: string | null }): string {
  if (f.subtipo === "dispensa_aviso_art488") return "Dispensa do aviso (Art. 488)";
  if (f.subtipo === "banco_horas_aviso" || f.direito_origem === "banco_horas_desligamento") return "Folga compensatória (banco no aviso)";
  if (f.subtipo === "compensacao_feriado" || f.direito_origem === "compensacao_feriado") return "Folga compensatória (feriado)";
  if (f.subtipo === "folga_compensatoria" || f.direito_origem === "banco_horas") return "Folga compensatória";
  return f.tipo === "extra" || f.extra ? "Folga extra autorizada" : "Folga";
}