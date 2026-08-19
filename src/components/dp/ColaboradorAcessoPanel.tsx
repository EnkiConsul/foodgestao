import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Eye, EyeOff, KeyRound, Lock, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { maskCpf } from "@/lib/cpf";
import type { DpColaborador } from "@/hooks/useDpColaboradores";
import { acessoPortalAtivo, diasRestantesCarencia } from "@/lib/dp/desligamento";

const fmt = (d?: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR") : "—");

/**
 * Aba "Acesso ao portal" do cadastro: gerar acesso, redefinir e definir senha
 * ficam junto da ficha do colaborador, com o login sempre pelo CPF.
 */
export function ColaboradorAcessoPanel({
  colaborador,
  onAtualizado,
}: {
  colaborador: DpColaborador | null;
  onAtualizado?: () => void;
}) {
  const [busy, setBusy] = useState<null | "criar" | "reset" | "senha">(null);
  const [resultado, setResultado] = useState<{ cpf: string; password: string; kind: "created" | "reset" } | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmSenha, setConfirmSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);

  if (!colaborador?.id) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        Salve o cadastro para gerar o acesso ao portal.
      </p>
    );
  }

  const cpfDigits = (colaborador.cpf ?? "").replace(/\D/g, "");
  const userId = (colaborador as any).user_id as string | null;
  const acessoAte = (colaborador as any).acesso_portal_ate as string | null;

  const copiar = async (label: string, valor: string) => {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(label);
      window.setTimeout(() => setCopiado((v) => (v === label ? null : v)), 1500);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const criarAcesso = async () => {
    if (userId) { toast.error("Colaborador já possui acesso — use Redefinir senha."); return; }
    if (cpfDigits.length !== 11) {
      toast.error("CPF inválido — complete o cadastro (11 dígitos) antes de gerar o acesso.");
      return;
    }
    setBusy("criar");
    try {
      const { data, error } = await supabase.functions.invoke("dp-criar-acesso-colaborador", {
        body: { colaborador_id: colaborador.id },
      });
      if (error) throw error;
      const payload = data as { password?: string; cpf?: string; error?: string };
      if (payload?.error) throw new Error(payload.error);
      if (payload?.password && payload?.cpf) {
        setResultado({ cpf: payload.cpf, password: payload.password, kind: "created" });
      }
      onAtualizado?.();
    } catch (e) {
      toast.error("Erro ao gerar acesso", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  const redefinirSenha = async () => {
    if (!userId) { toast.error("Colaborador não possui usuário vinculado ao portal"); return; }
    setBusy("reset");
    try {
      const { data, error } = await supabase.functions.invoke("dp-reset-password", {
        body: { colaborador_id: colaborador.id },
      });
      if (error) throw error;
      const pwd = (data as any)?.password as string | undefined;
      if (pwd) setResultado({ cpf: colaborador.cpf ?? "", password: pwd, kind: "reset" });
      else toast.success("Senha redefinida");
    } catch (e) {
      toast.error("Erro ao redefinir senha", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  const gerarSenhaAleatoria = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    const arr = new Uint32Array(12);
    crypto.getRandomValues(arr);
    let out = "";
    for (let i = 0; i < 12; i++) out += chars[arr[i] % chars.length];
    setNovaSenha(out);
    setConfirmSenha(out);
    setMostrarSenha(true);
  };

  const definirSenha = async () => {
    if (!userId) { toast.error("Gere o acesso ao portal antes de definir uma senha"); return; }
    if (novaSenha.length < 6 || novaSenha.length > 72) {
      toast.error("A senha deve ter entre 6 e 72 caracteres");
      return;
    }
    if (novaSenha !== confirmSenha) { toast.error("As senhas não conferem"); return; }
    setBusy("senha");
    try {
      const { data, error } = await supabase.functions.invoke("dp-alterar-senha-colaborador", {
        body: { colaborador_id: colaborador.id, nova_senha: novaSenha },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setResultado({ cpf: colaborador.cpf ?? "", password: novaSenha, kind: "reset" });
      setNovaSenha("");
      setConfirmSenha("");
    } catch (e) {
      toast.error("Erro ao alterar senha", { description: e instanceof Error ? e.message : String(e) });
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
          {userId ? (
            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="mr-1 h-3 w-3" aria-hidden="true" /> Acesso liberado
            </Badge>
          ) : (
            <Badge variant="outline">Sem acesso</Badge>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Login (CPF)</div>
            <div className="text-sm">{cpfDigits.length === 11 ? maskCpf(cpfDigits) : "CPF incompleto"}</div>
          </div>
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

        <div className="flex flex-wrap gap-2">
          {!userId ? (
            <Button onClick={() => void criarAcesso()} disabled={busy !== null}>
              <KeyRound className="mr-2 h-4 w-4" aria-hidden="true" />
              {busy === "criar" ? "Gerando..." : "Gerar acesso ao portal"}
            </Button>
          ) : (
            <Button variant="outline" onClick={() => void redefinirSenha()} disabled={busy !== null}>
              <KeyRound className="mr-2 h-4 w-4" aria-hidden="true" />
              {busy === "reset" ? "Redefinindo..." : "Redefinir senha (gerar nova)"}
            </Button>
          )}
        </div>
      </div>

      {userId && (
        <div className="space-y-3 rounded-xl border border-border p-4">
          <div className="text-sm font-semibold">Definir uma senha específica</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="nova-senha-colab">Nova senha</Label>
              <div className="flex gap-2">
                <Input
                  id="nova-senha-colab"
                  type={mostrarSenha ? "text" : "password"}
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setMostrarSenha((v) => !v)}
                  title={mostrarSenha ? "Ocultar" : "Mostrar"}
                >
                  {mostrarSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirma-senha-colab">Confirmar senha</Label>
              <Input
                id="confirma-senha-colab"
                type={mostrarSenha ? "text" : "password"}
                value={confirmSenha}
                onChange={(e) => setConfirmSenha(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={gerarSenhaAleatoria} disabled={busy !== null}>
              Gerar senha forte
            </Button>
            <Button size="sm" onClick={() => void definirSenha()} disabled={busy !== null}>
              {busy === "senha" ? "Salvando..." : "Salvar senha"}
            </Button>
          </div>
        </div>
      )}

      {resultado && (
        <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="text-sm font-semibold">
            {resultado.kind === "created" ? "Acesso criado" : "Senha definida"} — informe ao colaborador
          </div>
          <p className="text-xs text-muted-foreground">
            O login no portal é feito pelo CPF. Esta senha aparece apenas agora.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { label: "CPF", valor: resultado.cpf ? maskCpf(resultado.cpf) : "—", copia: resultado.cpf },
              { label: "Senha", valor: resultado.password, copia: resultado.password },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2">
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{item.label}</div>
                  <div className="truncate font-mono text-sm">{item.valor}</div>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => void copiar(item.label, item.copia)}
                  title="Copiar"
                >
                  {copiado === item.label ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
