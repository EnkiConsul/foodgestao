import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, Zap, Check, AlertTriangle, Building2, RefreshCw } from "lucide-react";

import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const PLUGGY_SDK_SRC = "https://cdn.pluggy.ai/pluggy-connect/v2.10.0/pluggy-connect.js";

type Step = "intro" | "connecting" | "accounts" | "done" | "error";

interface OpenFinanceAccountRow {
  id: string;
  pluggy_account_id: string;
  name: string | null;
  number: string | null;
  type: string | null;
  subtype: string | null;
  balance: number | null;
  local_account_id: string | null;
  auto_import: boolean;
  ignored: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  onFinished: () => void;
  /** Quando informado, o widget abre em modo de reconexão (atualizar credenciais/MFA do item). */
  reconnectItemId?: string | null;
}


function loadPluggyScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("no_window"));
    if ((window as any).PluggyConnect) return resolve();
    const existing = document.querySelector(`script[data-pluggy-connect]`) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("pluggy_sdk_load_error")), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = PLUGGY_SDK_SRC;
    s.async = true;
    s.dataset.pluggyConnect = "true";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("pluggy_sdk_load_error"));
    document.head.appendChild(s);
  });
}

export function OpenFinanceWizard({ open, onOpenChange, companyId, onFinished, reconnectItemId }: Props) {
  const [step, setStep] = useState<Step>("intro");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<OpenFinanceAccountRow[]>([]);
  const [institutionName, setInstitutionName] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [purging, setPurging] = useState(false);
  const pluggyRef = useRef<any>(null);

  const purgeOrphans = useCallback(async () => {
    if (!companyId) return;
    setPurging(true);
    try {
      const { data, error: err } = await supabase.functions.invoke("pluggy-items-purge-orphans", {
        body: { company_id: companyId },
      });
      if (err) throw new Error(err.message);
      const deleted = (data as any)?.deleted_count ?? 0;
      toast.success(`${deleted} acesso(s) órfão(s) removido(s) da Pluggy.`, {
        description: "Você já pode tentar conectar novamente.",
      });
      setStep("intro");
      setError(null);
    } catch (e: any) {
      toast.error("Falha ao limpar acessos órfãos.", { description: e?.message });
    } finally {
      setPurging(false);
    }
  }, [companyId]);


  // Reset when reopened
  useEffect(() => {
    if (open) {
      setStep("intro");
      setError(null);
      setConnectionId(null);
      setAccounts([]);
      setInstitutionName(null);
    }
  }, [open]);

  const startConnect = useCallback(async () => {
    if (!companyId) {
      setError("Selecione uma empresa antes de conectar.");
      setStep("error");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await loadPluggyScript();
      const { data, error: tokenErr } = await supabase.functions.invoke("pluggy-connect-token", {
        body: { company_id: companyId, ...(reconnectItemId ? { item_id: reconnectItemId } : {}) },
      });
      if (tokenErr || !data?.access_token) {
        throw new Error(tokenErr?.message || (data as any)?.error || "connect_token_failed");
      }
      const requestId = (data as any).request_id as string | null;

      setStep("connecting");
      const PluggyConnect = (window as any).PluggyConnect;
      pluggyRef.current = new PluggyConnect({
        connectToken: data.access_token,
        includeSandbox: false,
        ...(reconnectItemId ? { updateItem: reconnectItemId } : {}),
        onSuccess: async (payload: any) => {
          try {
            const itemId = payload?.item?.id;
            if (!itemId) throw new Error("no_item_id");
            setBusy(true);
            const { data: reg, error: regErr } = await supabase.functions.invoke("pluggy-item-register", {
              body: { company_id: companyId, item_id: itemId, request_id: requestId },
            });
            if (regErr || !reg?.connection_id) {
              throw new Error(regErr?.message || (reg as any)?.error || "register_failed");
            }
            setConnectionId(reg.connection_id);
            await loadAccounts(reg.connection_id);
            setStep("accounts");
          } catch (e: any) {
            setError(e?.message || "Falha ao registrar conexão.");
            setStep("error");
          } finally {
            setBusy(false);
          }
        },
        onError: (err: any) => {
          console.error("[pluggy-widget] error", err);
          setError(err?.message || "Falha na conexão com o banco.");
          setStep("error");
          setBusy(false);
        },
        onClose: () => {
          // if not connected yet, go back to intro
          setStep((prev) => (prev === "connecting" ? "intro" : prev));
        },
      });
      pluggyRef.current.init();
    } catch (e: any) {
      setError(e?.message || "Não foi possível iniciar o Open Finance.");
      setStep("error");
    } finally {
      setBusy(false);
    }
  }, [companyId, reconnectItemId]);

  const loadAccounts = useCallback(async (connId: string) => {
    const { data, error: err } = await supabase
      .from("open_finance_accounts")
      .select("id, pluggy_account_id, name, number, type, subtype, balance, local_account_id, auto_import, ignored")
      .eq("connection_id", connId)
      .order("created_at", { ascending: true });
    if (err) {
      console.error("[of-wizard] loadAccounts", err);
      return;
    }
    setAccounts((data ?? []) as OpenFinanceAccountRow[]);
    // Fetch institution name for header
    const { data: conn } = await supabase
      .from("open_finance_connections")
      .select("institution_name")
      .eq("id", connId)
      .maybeSingle();
    setInstitutionName(conn?.institution_name ?? null);
  }, []);

  const toggleAutoImport = async (row: OpenFinanceAccountRow, value: boolean) => {
    const prev = row.auto_import;
    setAccounts((list) => list.map((a) => (a.id === row.id ? { ...a, auto_import: value } : a)));
    const { error: err } = await supabase.rpc("set_open_finance_auto_import", {
      _of_account_id: row.id,
      _enabled: value,
    });
    if (err) {
      setAccounts((list) => list.map((a) => (a.id === row.id ? { ...a, auto_import: prev } : a)));
      toast.error("Não foi possível atualizar a preferência.");
    }
  };

  const toggleIgnored = async (row: OpenFinanceAccountRow, value: boolean) => {
    const prev = row.ignored;
    setAccounts((list) => list.map((a) => (a.id === row.id ? { ...a, ignored: value } : a)));
    const { error: err } = await supabase.rpc("ignore_open_finance_account", {
      _of_account_id: row.id,
      _ignored: value,
    });
    if (err) {
      setAccounts((list) => list.map((a) => (a.id === row.id ? { ...a, ignored: prev } : a)));
      toast.error("Não foi possível atualizar.");
    }
  };

  const linkNewAccount = async (row: OpenFinanceAccountRow) => {
    if (!companyId) return;
    setBusy(true);
    try {
      const subtype = (row.subtype ?? "").toUpperCase();
      const type = (row.type ?? "").toUpperCase();
      const accountType: "corrente" | "poupanca" | "investimento" | "cartao_credito" | "outro" =
        type === "CREDIT" || subtype.includes("CREDIT_CARD")
          ? "cartao_credito"
          : subtype.includes("SAVINGS")
          ? "poupanca"
          : type === "INVESTMENT"
          ? "investimento"
          : type === "BANK"
          ? "corrente"
          : "outro";
      const { data, error: err } = await supabase.rpc("create_and_link_open_finance_account", {
        _of_account_id: row.id,
        _account_name: row.name ?? institutionName ?? "Conta Open Finance",
        _account_type: accountType,
        _initial_balance: row.balance ?? 0,
        _auto_import: row.auto_import,
      });
      if (err) throw err;
      setAccounts((list) => list.map((a) => (a.id === row.id ? { ...a, local_account_id: data as string } : a)));
      toast.success("Conta criada e vinculada.");
    } catch (e: any) {
      toast.error("Falha ao criar conta local.", { description: e?.message });
    } finally {
      setBusy(false);
    }
  };

  const triggerSync = async () => {
    if (!connectionId) return;
    setSyncing(true);
    try {
      const { error: err } = await supabase.functions.invoke("pluggy-sync", {
        body: { connection_id: connectionId, initial: true },
      });
      if (err) throw new Error(err.message);
      toast.success("Sincronização iniciada.", {
        description: "Os lançamentos ficarão disponíveis na Central de Conciliação.",
      });
      setStep("done");
    } catch (e: any) {
      toast.error("Falha ao iniciar sincronização.", { description: e?.message });
    } finally {
      setSyncing(false);
    }
  };

  const finish = () => {
    onOpenChange(false);
    onFinished();
  };

  const linkedCount = useMemo(
    () => accounts.filter((a) => a.local_account_id && !a.ignored).length,
    [accounts],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            Conectar via Open Finance
          </DialogTitle>
          <DialogDescription>
            {step === "accounts" && institutionName
              ? `Contas encontradas em ${institutionName}.`
              : "Sincronize saldos e lançamentos automaticamente com seu banco."}
          </DialogDescription>
        </DialogHeader>

        {!companyId && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Empresa não selecionada</AlertTitle>
            <AlertDescription>
              O Open Finance só está disponível no contexto empresarial. Selecione uma empresa no seletor global.
            </AlertDescription>
          </Alert>
        )}

        {step === "intro" && companyId && (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Você será direcionado ao ambiente seguro da Pluggy para autorizar o acesso à sua instituição.
              O 360°FOOD nunca recebe suas senhas.
            </p>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li className="flex gap-2"><Check className="h-3.5 w-3.5 text-primary mt-0.5" /> Consentimento válido por até 12 meses</li>
              <li className="flex gap-2"><Check className="h-3.5 w-3.5 text-primary mt-0.5" /> Você pode desconectar a qualquer momento</li>
              <li className="flex gap-2"><Check className="h-3.5 w-3.5 text-primary mt-0.5" /> Lançamentos ficam pendentes de aprovação na Central de Conciliação</li>
            </ul>
            <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground space-y-2">
              <p>
                <strong className="text-foreground">O widget acusou "Você já possui uma conexão com este acesso"?</strong> Isso
                pode indicar acessos órfãos criados na Pluggy em tentativas anteriores. Use o botão abaixo para removê-los antes
                de tentar novamente.
              </p>
              <Button size="sm" variant="outline" onClick={purgeOrphans} disabled={purging || busy}>
                {purging ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <RefreshCw className="h-3.5 w-3.5 mr-2" />}
                Limpar acessos órfãos na Pluggy
              </Button>
            </div>

          </div>
        )}

        {step === "connecting" && (
          <div className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Aguardando autorização no widget da Pluggy...
          </div>
        )}

        {step === "accounts" && (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {accounts.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma conta encontrada nesta conexão.</p>
            )}
            {accounts.map((a) => (
              <div
                key={a.id}
                className={cn(
                  "rounded-lg border p-3 space-y-3",
                  a.ignored && "opacity-60",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 min-w-0">
                    <Building2 className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{a.name ?? "Conta"}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {[a.subtype ?? a.type, a.number].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-muted-foreground">Saldo</div>
                    <div className="text-sm font-semibold tabular-nums">
                      {a.balance != null
                        ? a.balance.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                        : "—"}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {a.local_account_id ? (
                    <Badge variant="secondary" className="gap-1">
                      <Check className="h-3 w-3" /> Vinculada
                    </Badge>
                  ) : (
                    <Button size="sm" variant="outline" disabled={busy || a.ignored} onClick={() => linkNewAccount(a)}>
                      Criar conta no 360°FOOD
                    </Button>
                  )}

                  <div className="ml-auto flex items-center gap-4">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Switch
                        checked={a.auto_import}
                        onCheckedChange={(v) => toggleAutoImport(a, v)}
                        disabled={a.ignored}
                      />
                      Importar automaticamente
                    </label>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Switch
                        checked={a.ignored}
                        onCheckedChange={(v) => toggleIgnored(a, v)}
                      />
                      Ignorar
                    </label>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {step === "done" && (
          <div className="space-y-3 py-4 text-sm">
            <div className="flex items-center gap-2 text-primary">
              <Check className="h-4 w-4" />
              <span className="font-medium">Conexão concluída</span>
            </div>
            <p className="text-muted-foreground">
              A primeira sincronização foi enfileirada. Assim que os lançamentos chegarem, você poderá revisá-los na Central de Conciliação.
            </p>
          </div>
        )}

        {step === "error" && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Ocorreu um erro</AlertTitle>
            <AlertDescription>{error || "Falha inesperada."}</AlertDescription>
          </Alert>
        )}

        <DialogFooter className="gap-2">
          {step === "intro" && companyId && (
            <Button onClick={startConnect} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Zap className="h-4 w-4 mr-2" />}
              Iniciar conexão
            </Button>
          )}
          {step === "accounts" && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={syncing}>
                Concluir depois
              </Button>
              <Button onClick={triggerSync} disabled={syncing || linkedCount === 0}>
                {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Iniciar primeira sincronização
              </Button>
            </>
          )}
          {step === "done" && <Button onClick={finish}>Fechar</Button>}
          {step === "error" && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
              <Button onClick={() => setStep("intro")}>Tentar novamente</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
