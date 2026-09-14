import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, KeyRound, Lock, MessageSquare, ShieldAlert, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { maskCpf } from "@/lib/cpf";
import type { DpColaborador } from "@/hooks/useDpColaboradores";
import { acessoPortalAtivo, diasRestantesCarencia } from "@/lib/dp/desligamento";
import { WhatsappComposerDialog } from "@/components/dp/WhatsappComposerDialog";
import { ConfirmarAcaoDialog } from "@/components/dp/ConfirmarAcaoDialog";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { PUBLIC_SITE_ORIGIN } from "@/lib/siteOrigin";
import {
  MODELO_ACESSO_PORTAL_TITULO,
  MODELO_NOVA_SENHA_TITULO,
  PORTAL_COLABORADOR_PATH,
} from "@/lib/dp/modelosPortal";
import { dataBr as fmt } from "@/lib/dp/formato";

const fmtPrazo = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";

type Situacao = "sem_acesso" | "pendente_ativacao" | "ativo" | "reset_solicitado" | "bloqueado";

const ROTULO: Record<Situacao, string> = {
  sem_acesso: "Sem acesso",
  pendente_ativacao: "Acesso pendente de ativação",
  ativo: "Acesso ativo",
  reset_solicitado: "Redefinição solicitada",
  bloqueado: "Acesso bloqueado",
};

/**
 * Aba "Acesso ao portal" do cadastro.
 *
 * O gestor libera, reenvia, redefine e bloqueia o acesso — mas nunca vê, define
 * nem copia a senha do colaborador: o que ele entrega é um link de uso único
 * para a pessoa criar a própria senha. O login é sempre o CPF.
 */
export function ColaboradorAcessoPanel({
  colaborador,
  onAtualizado,
}: {
  colaborador: DpColaborador | null;
  onAtualizado?: () => void;
}) {
  const [busy, setBusy] = useState<null | "liberar" | "redefinir" | "bloquear">(null);
  const [situacao, setSituacao] = useState<Situacao | null>(null);
  const [prazo, setPrazo] = useState<string | null>(null);
  const [link, setLink] = useState<{ url: string; kind: "activation" | "reset"; expires: string | null } | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [waOpen, setWaOpen] = useState(false);
  const { companies, selectedCompanyId } = useCompanyContext();
  const empresaNome = (companies ?? []).find((c: any) => c.id === selectedCompanyId)?.name ?? "";

  const colaboradorId = colaborador?.id ?? null;

  const carregarSituacao = useCallback(async () => {
    if (!colaboradorId) return;
    const { data, error } = await supabase.rpc("dp_portal_acesso_status", {
      p_colaborador_id: colaboradorId,
    });
    if (error) {
      setSituacao(null);
      return;
    }
    const linha = (data as any[] | null)?.[0];
    setSituacao((linha?.status as Situacao) ?? "sem_acesso");
    setPrazo(linha?.expires_at ?? null);
  }, [colaboradorId]);

  useEffect(() => {
    void carregarSituacao();
  }, [carregarSituacao]);

  if (!colaborador?.id) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        Salve o cadastro para gerar o acesso ao portal.
      </p>
    );
  }

  const cpfDigits = (colaborador.cpf ?? "").replace(/\D/g, "");
  const acessoAte = (colaborador as any).acesso_portal_ate as string | null;
  const temAcesso = situacao !== null && situacao !== "sem_acesso";

  const copiarLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 1500);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const liberarAcesso = async () => {
    if (cpfDigits.length !== 11) {
      toast.error("CPF incompleto — complete o cadastro antes de liberar o acesso.");
      return;
    }
    setBusy("liberar");
    try {
      const { data, error } = await supabase.functions.invoke("dp-criar-acesso-colaborador", {
        body: { colaborador_id: colaborador.id },
      });
      if (error) throw error;
      const payload = data as { error?: string; activation_url?: string; expires_at?: string };
      if (payload?.error) throw new Error(payload.error);
      if (payload?.activation_url) {
        setLink({ url: payload.activation_url, kind: "activation", expires: payload.expires_at ?? null });
      }
      await carregarSituacao();
      onAtualizado?.();
    } catch (e) {
      toast.error("Não foi possível liberar o acesso", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(null);
    }
  };

  const redefinirAcesso = async () => {
    setBusy("redefinir");
    try {
      const { data, error } = await supabase.functions.invoke("dp-reset-password", {
        body: { colaborador_id: colaborador.id },
      });
      if (error) throw error;
      const payload = data as { error?: string; reset_url?: string; expires_at?: string };
      if (payload?.error) throw new Error(payload.error);
      if (payload?.reset_url) {
        setLink({ url: payload.reset_url, kind: "reset", expires: payload.expires_at ?? null });
      }
      await carregarSituacao();
      onAtualizado?.();
    } catch (e) {
      toast.error("Não foi possível redefinir o acesso", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(null);
    }
  };

  const alternarBloqueio = async (bloquear: boolean) => {
    setBusy("bloquear");
    try {
      const { data, error } = await supabase.functions.invoke("dp-bloquear-acesso-colaborador", {
        body: { colaborador_id: colaborador.id, bloquear },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setLink(null);
      toast.success(bloquear ? "Acesso bloqueado" : "Acesso reativado");
      await carregarSituacao();
      onAtualizado?.();
    } catch (e) {
      toast.error("Não foi possível concluir", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Lock className="h-4 w-4 text-primary" aria-hidden="true" />
            Acesso ao portal do colaborador
          </div>
          {situacao === "ativo" ? (
            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="mr-1 h-3 w-3" aria-hidden="true" /> {ROTULO.ativo}
            </Badge>
          ) : situacao === "bloqueado" ? (
            <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">
              <ShieldAlert className="mr-1 h-3 w-3" aria-hidden="true" /> {ROTULO.bloqueado}
            </Badge>
          ) : (
            <Badge variant="outline">{ROTULO[situacao ?? "sem_acesso"]}</Badge>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Login (CPF)</div>
            <div className="text-sm">{cpfDigits.length === 11 ? maskCpf(cpfDigits) : "CPF incompleto"}</div>
          </div>
          {prazo && (
            <div className="space-y-1">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Link válido até</div>
              <div className="text-sm">{fmtPrazo(prazo)}</div>
            </div>
          )}
          {colaborador.data_desligamento && (
            <div className="space-y-1">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Carência do portal</div>
              <div className="text-sm">
                {acessoPortalAtivo(acessoAte)
                  ? `Consulta até ${fmt(acessoAte)} (${diasRestantesCarencia(acessoAte)} dias)`
                  : "Encerrada"}
              </div>
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          A senha é criada pelo próprio colaborador. Você entrega apenas um link de uso único — ninguém do
          escritório vê ou define a senha dele.
        </p>

        <div className="flex flex-wrap gap-2">
          {!temAcesso ? (
            <Button onClick={() => void liberarAcesso()} disabled={busy !== null}>
              <KeyRound className="mr-2 h-4 w-4" aria-hidden="true" />
              {busy === "liberar" ? "Liberando..." : "Liberar acesso"}
            </Button>
          ) : (
            <>
              {situacao === "pendente_ativacao" && (
                <Button variant="outline" onClick={() => void liberarAcesso()} disabled={busy !== null}>
                  <KeyRound className="mr-2 h-4 w-4" aria-hidden="true" />
                  {busy === "liberar" ? "Gerando..." : "Reenviar ativação"}
                </Button>
              )}
              {situacao !== "bloqueado" && (
                <Button variant="outline" onClick={() => void redefinirAcesso()} disabled={busy !== null}>
                  <KeyRound className="mr-2 h-4 w-4" aria-hidden="true" />
                  {busy === "redefinir" ? "Gerando..." : "Redefinir acesso"}
                </Button>
              )}
              {situacao === "bloqueado" ? (
                <Button variant="outline" onClick={() => void alternarBloqueio(false)} disabled={busy !== null}>
                  Reativar acesso
                </Button>
              ) : (
                <ConfirmarAcaoDialog
                  titulo="Bloquear o acesso ao portal?"
                  descricao="O colaborador deixa de entrar no portal até você reativar. Links pendentes deixam de valer."
                  confirmar="Bloquear acesso"
                  onConfirm={() => void alternarBloqueio(true)}
                  disabled={busy !== null}
                >
                  <Button variant="outline" disabled={busy !== null}>
                    Bloquear acesso
                  </Button>
                </ConfirmarAcaoDialog>
              )}
            </>
          )}
        </div>
      </div>

      {link && (
        <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="text-sm font-semibold">
            {link.kind === "activation" ? "Link de ativação criado" : "Link de nova senha criado"} — envie ao colaborador
          </div>
          <p className="text-xs text-muted-foreground">
            Serve uma única vez{link.expires ? ` e vale até ${fmtPrazo(link.expires)}` : ""}. O colaborador entra
            com o CPF e cria a senha dele.
          </p>
          <p className="text-xs text-muted-foreground">
            Envie o link apenas para o WhatsApp do próprio colaborador e não guarde cópias: quem
            tiver o link em mãos consegue criar a primeira senha. A senha definitiva fica só com o
            colaborador — ninguém aqui consegue vê-la ou defini-la.
          </p>
          <div className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Link</div>
              <div className="truncate font-mono text-xs">{link.url}</div>
            </div>
            <Button aria-label="Confirmar" type="button" size="icon" variant="ghost" onClick={() => void copiarLink()} title="Copiar link">
              {copiado ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <Button type="button" size="sm" onClick={() => setWaOpen(true)}>
            <MessageSquare className="mr-2 h-4 w-4" aria-hidden="true" />
            Enviar no WhatsApp
          </Button>
        </div>
      )}

      {link && (
        <WhatsappComposerDialog
          open={waOpen}
          onClose={() => setWaOpen(false)}
          colaboradorId={colaborador.id}
          nome={colaborador.nome ?? ""}
          titulosPreferidos={
            link.kind === "activation"
              ? [MODELO_ACESSO_PORTAL_TITULO]
              : [MODELO_NOVA_SENHA_TITULO, MODELO_ACESSO_PORTAL_TITULO]
          }
          contexto={{
            nome: colaborador.nome ?? "",
            empresa: empresaNome,
            link: link.url,
            portal: `${PUBLIC_SITE_ORIGIN}${PORTAL_COLABORADOR_PATH}`,
            usuario: cpfDigits ? maskCpf(cpfDigits) : "",
            senha: "",
          }}
        />
      )}

    </div>
  );
}
