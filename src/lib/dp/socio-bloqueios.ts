// ------------------------------------------------------------------
// Domínio: DP → bloqueio de datas gerado por ausência de sócio
//
// Quando um sócio marca folga ou férias, a empresa pode querer fechar
// aquele dia (ou período) para os demais colaboradores. O motivo é gravado
// em `dp_datas_bloqueadas.motivo` com um prefixo reconhecível, para que o
// bloqueio possa ser localizado e removido depois.
// ------------------------------------------------------------------

export const SOCIO_BLOQUEIO_PREFIXO = "Folga/Férias do sócio";

export function motivoBloqueioSocio(nome: string): string {
  return `${SOCIO_BLOQUEIO_PREFIXO} ${nome}`;
}

export function ehBloqueioDeSocio(motivo?: string | null): boolean {
  return !!motivo && motivo.startsWith(SOCIO_BLOQUEIO_PREFIXO);
}

/** Todas as datas (ISO) entre início e fim, inclusive. */
export function datasDoPeriodo(inicio: string, fim: string): string[] {
  const out: string[] = [];
  const d = new Date(`${inicio}T12:00:00`);
  const limite = new Date(`${fim}T12:00:00`);
  while (d <= limite) {
    out.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    );
    d.setDate(d.getDate() + 1);
  }
  return out;
}
