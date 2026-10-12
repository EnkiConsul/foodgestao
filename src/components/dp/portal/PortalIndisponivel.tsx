import { Link } from "react-router-dom";
import { Lock, LogOut, CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import type { PortalEstado } from "@/hooks/usePortalAcesso";

const TEXTOS: Partial<Record<PortalEstado, { titulo: string; colab: string; dono: string }>> = {
  sem_modulo: {
    titulo: "Módulo Pessoas Não Contratado",
    colab: "A empresa ainda não contratou o módulo Pessoas 360°, necessário para usar o Portal do Colaborador. Fale com o dono ou administrador da empresa para verificar a situação.",
    dono: "Sua empresa não tem o módulo Pessoas 360° contratado. Contrate o módulo para liberar o Portal do Colaborador para você e sua equipe.",
  },
  sem_plano: {
    titulo: "Assinatura Inativa",
    colab: "A assinatura da empresa não está ativa no momento. Fale com o dono ou administrador da empresa para verificar a situação.",
    dono: "A assinatura da sua empresa não está ativa. Regularize ou contrate um plano para liberar o Portal do Colaborador.",
  },
  empresa_inativa: {
    titulo: "Empresa Inativa",
    colab: "O cadastro da empresa está inativo. Fale com o dono ou administrador da empresa.",
    dono: "O cadastro da sua empresa está inativo. Reative a empresa ou fale com nosso suporte.",
  },
  bloqueado: {
    titulo: "Acesso Bloqueado",
    colab: "Seu acesso ao portal foi bloqueado pela empresa. Fale com o dono ou administrador.",
    dono: "Este acesso ao portal está bloqueado. Revise o cadastro do colaborador.",
  },
  desligado_expirado: {
    titulo: "Acesso Encerrado",
    colab: "O prazo de acesso após o desligamento terminou. Em caso de dúvida, fale com a empresa.",
    dono: "O prazo de acesso após o desligamento terminou.",
  },
};

export const ESTADOS_BLOQUEIO_PORTAL = Object.keys(TEXTOS) as PortalEstado[];

export function PortalIndisponivel({ estado, isDono }: { estado: PortalEstado; isDono: boolean }) {
  const t = TEXTOS[estado] ?? TEXTOS.sem_modulo!;
  const podeContratar = isDono && (estado === "sem_modulo" || estado === "sem_plano");
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <Lock className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-lg font-semibold">{t.titulo}</h1>
        <p className="text-sm text-muted-foreground">{isDono ? t.dono : t.colab}</p>
        <div className="flex flex-col gap-2">
          {podeContratar && (
            <Button asChild className="min-h-11">
              <Link to="/planos"><CreditCard className="mr-1.5 h-4 w-4" /> Contratar Módulo</Link>
            </Button>
          )}
          {isDono && (
            <Button asChild variant="outline" className="min-h-11">
              <Link to="/hub">Ir para a Área Administrativa</Link>
            </Button>
          )}
          <Button variant="outline" className="min-h-11" onClick={() => supabase.auth.signOut()}>
            <LogOut className="mr-1.5 h-4 w-4" /> Sair da Conta
          </Button>
        </div>
      </div>
    </div>
  );
}
