import { BookOpen, FileText, Receipt, ShieldAlert } from "lucide-react";

export const TELAS_DOCUMENTOS = [
  { to: "/dp/documentos", label: "Gestão de Documentos", icon: FileText },
  { to: "/dp/documentos/recibos", label: "Recibos", icon: Receipt },
  { to: "/dp/documentos/atas", label: "Atas de Reunião", icon: BookOpen },
  { to: "/dp/disciplinar", label: "Disciplinares", icon: ShieldAlert },
];

/** Tela de Documentos correspondente ao endereço (ou null fora do módulo). */
export function telaDocumentosDoPath(pathname: string): string | null {
  const p = pathname.replace(/\/+$/, "");
  // Endereço antigo do Histórico (unificado na Gestão de Documentos).
  if (p === "/dp/documentos" || p === "/dp/documentos/historico") return "/dp/documentos";
  const t = TELAS_DOCUMENTOS.slice(1).find((t) => p === t.to || p.startsWith(`${t.to}/`));
  return t?.to ?? null;
}
