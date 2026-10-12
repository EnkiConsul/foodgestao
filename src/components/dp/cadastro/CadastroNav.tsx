import { BellRing, Briefcase, Building2, Gift, Users } from "lucide-react";

export const TELAS_CADASTRO = [
  { to: "/dp/colaboradores", label: "Colaboradores", icon: Users },
  { to: "/dp/cadastros/cargos", label: "Cargos e Salários", icon: Briefcase },
  { to: "/dp/cadastros/unidades", label: "Unidades", icon: Building2 },
  { to: "/dp/cadastros/beneficios", label: "Benefícios", icon: Gift },
  { to: "/dp/cadastros/pendencias", label: "Pendências", icon: BellRing },
];

/** Tela de Cadastro correspondente ao endereço (só telas de lista, não fichas). */
export function telaCadastroDoPath(pathname: string): string | null {
  const p = pathname.replace(/\/+$/, "");
  return TELAS_CADASTRO.find((t) => p === t.to)?.to ?? null;
}
