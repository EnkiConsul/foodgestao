import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { parseEdgeFunctionError } from "@/lib/edgeFunctionError";
import { describeConnectError, type ConnectErrorDescription } from "@/lib/pluggy/connectErrors";



interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  itemIdToUpdate?: string; // reconnect existing item
  onConnected?: (payload: { itemId: string; connectionId?: string }) => void;
}

declare global {
  interface Window {
    PluggyConnect?: new (opts: any) => { init: () => void; destroy?: () => void };
  }
}

const SCRIPT_SRC = "https://cdn.pluggy.ai/pluggy-connect/v2.11.0/pluggy-connect.js";
const RESUME_KEY = "pluggy_connect_resume_v1";
const RESUME_TTL_MS = 25 * 60 * 1000; // connect token dura ~30 min
const INTRO_KEY = "pluggy_connect_intro_dismissed_v1";


type ResumeState = {
  accessToken?: string;
  companyId?: string;
  itemIdToUpdate?: string;
  connectRequestId?: string | null;
  connectorIds?: number[] | null;
  createdAt?: number;
};

function readResume(): ResumeState | null {
  try {
    const raw = sessionStorage.getItem(RESUME_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ResumeState;
    if (!parsed?.createdAt || Date.now() - parsed.createdAt > RESUME_TTL_MS) {
      // Mantém o registro para permitir a checagem por webhook, mas o token
      // não serve mais para reabrir o widget.
      return { ...parsed, accessToken: undefined };
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Existe um fluxo de Open Finance iniciado e ainda não concluído nesta aba? */
export function hasPluggyResume(): boolean {
  if (typeof window === "undefined") return false;
  return !!readResume();
}

function clearResume() {
  try { sessionStorage.removeItem(RESUME_KEY); } catch { /* noop */ }
}

// Parâmetros que o banco/Pluggy devolvem na URL após o consentimento de Open
// Finance. Precisam ser consumidos aqui, senão o widget é reaberto do zero e o
// usuário volta a ver a tela de boas-vindas da Pluggy.
const RETURN_PARAMS = ["itemId", "item_id"] as const;
const ERROR_PARAMS = ["error", "error_code", "errorCode"] as const;
const ERROR_MESSAGE_PARAMS = ["error_description", "errorDescription", "error_message"] as const;

function readReturnItemId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const url = new URL(window.location.href);
    for (const key of RETURN_PARAMS) {
      const value = url.searchParams.get(key);
      if (value) return value;
    }
  } catch { /* noop */ }
  return null;
}

/** O banco devolveu um erro de autorização na URL de retorno? */
function readReturnError(): { code: string | null; message: string | null } | null {
  if (typeof window === "undefined") return null;
  try {
    const url = new URL(window.location.href);
    let code: string | null = null;
    for (const key of ERROR_PARAMS) {
      const value = url.searchParams.get(key);
      if (value) { code = value; break; }
    }
    let message: string | null = null;
    for (const key of ERROR_MESSAGE_PARAMS) {
      const value = url.searchParams.get(key);
      if (value) { message = value; break; }
    }
    const status = url.searchParams.get("status");
    if (!code && !message && status?.toLowerCase() !== "error") return null;
    return { code, message };
  } catch { /* noop */ }
  return null;
}

/** Voltamos do consentimento do banco com um item já autorizado (ou com erro)? */
export function hasPluggyReturn(): boolean {
  return !!readReturnItemId() || !!readReturnError();
}

function clearReturnParams() {
  try {
    const url = new URL(window.location.href);
    let changed = false;
    for (const key of [...RETURN_PARAMS, ...ERROR_PARAMS, ...ERROR_MESSAGE_PARAMS, "status"]) {
      if (url.searchParams.has(key)) { url.searchParams.delete(key); changed = true; }
    }
    if (!changed) return;
    const search = url.searchParams.toString();
    window.history.replaceState({}, "", `${url.pathname}${search ? `?${search}` : ""}${url.hash}`);
  } catch { /* noop */ }
}



function loadScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.PluggyConnect) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("script_load_failed")));
      return;
    }
    const s = document.createElement("script");
    s.src = SCRIPT_SRC; s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("script_load_failed"));
    document.head.appendChild(s);
  });
}

// URL de retorno após o consent de Open Finance no site do banco.
// Precisa ser same-origin com a página que abriu o Connect.
function buildOauthRedirectUri(): string {
  const url = new URL(window.location.href);
  // Limpa quaisquer params antigos para evitar loops.
  url.search = "";
  url.hash = "";
  return url.toString();
}

/**
 * Open Finance (C6, Itaú, BB…) precisa navegar o topo do navegador para
 * data.of.pluggy.ai, que recusa ser exibido dentro de um iframe
 * (ERR_BLOCKED_BY_RESPONSE). Se o app estiver embutido (preview do editor,
 * webview, etc.), a conexão precisa ser feita em uma aba própria.
 */
function isFramed(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}


export function PluggyConnectDialog({ open, onOpenChange, companyId, itemIdToUpdate, onConnected }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [widgetReady, setWidgetReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [phase, setPhase] = useState<"idle" | "intro" | "launch" | "framed" | "returning" | "failed">("idle");
  const [failure, setFailure] = useState<ConnectErrorDescription | null>(null);

  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [showInterSteps, setShowInterSteps] = useState(false);
  const instanceRef = useRef<any>(null);
  const launchedRef = useRef(false);
  const finishedRef = useRef(false);
  const requestIdRef = useRef<string | null>(null);
  const returnedItemIdRef = useRef<string | null>(null);

  // Decide se mostramos a orientação de escolha de conector antes do widget.
  // Retomadas (QR Code em andamento) e reconexões vão direto para o widget.
  useEffect(() => {
    if (!open) {
      setPhase("idle");
      setShowInterSteps(false);
      setDontShowAgain(false);
      setFailure(null);
      return;
    }
    if (isFramed()) {
      // Open Finance não funciona dentro de iframe: abre direto em aba própria.
      setPhase("idle");
      window.open(buildOauthRedirectUri(), "_blank", "noopener,noreferrer");
      onOpenChange(false);
      return;
    }

    // Retorno do consentimento: o banco devolveu o item autorizado na URL.
    // Concluímos a conexão aqui em vez de reabrir o widget da Pluggy.
    const returnedItemId = readReturnItemId();
    if (returnedItemId) {
      returnedItemIdRef.current = returnedItemId;
      clearReturnParams();
      setPhase("returning");
      return;
    }

    // Voltamos com erro do banco: a autorização não foi concluída.
    const returnError = readReturnError();
    if (returnError) {
      clearReturnParams();
      clearResume();
      setPending(false);
      setFailure(describeConnectError(returnError));
      setPhase("failed");
      return;
    }

    let dismissed = false;
    try { dismissed = localStorage.getItem(INTRO_KEY) === "1"; } catch { /* noop */ }
    const skip = dismissed || hasPluggyResume() || !!itemIdToUpdate;
    setPhase(skip ? "launch" : "intro");
  }, [open, itemIdToUpdate, onOpenChange]);

  /** Recomeça a conexão do zero, descartando qualquer estado retomado. */
  const retryConnect = useCallback(() => {
    clearResume();
    clearReturnParams();
    finishedRef.current = false;
    launchedRef.current = false;
    requestIdRef.current = null;
    returnedItemIdRef.current = null;
    setFailure(null);
    setError(null);
    setPending(false);
    setWidgetReady(false);
    setChecking(false);
    setPhase("launch");
  }, []);




  const startConnect = useCallback(() => {
    if (dontShowAgain) {
      try { localStorage.setItem(INTRO_KEY, "1"); } catch { /* noop */ }
    }
    setPhase("launch");
  }, [dontShowAgain]);

  /** Conclui a conexão a partir do item devolvido pelo banco na URL. */
  const finishReturn = useCallback(async (itemId: string) => {
    if (finishedRef.current) return;
    setChecking(true);
    setError(null);
    try {
      const { data: sync, error: syncError } = await supabase.functions.invoke("pluggy-sync-item", {
        body: { item_id: itemId, company_id: companyId, first_connect: true },
      });
      if (syncError) throw syncError;
      finishedRef.current = true;
      clearResume();
      toast.success(`Conexão concluída: ${sync?.transactions ?? 0} lançamentos importados`);
      onConnected?.({ itemId, connectionId: sync?.connection_id });
      onOpenChange(false);
    } catch (err: unknown) {
      const info = await parseEdgeFunctionError(err, "Não foi possível confirmar a autorização com o banco");
      setError(info.message);
    } finally {
      setChecking(false);
    }
  }, [companyId, onConnected, onOpenChange]);

  useEffect(() => {
    if (!open || phase !== "returning") return;
    const itemId = returnedItemIdRef.current;
    if (!itemId) { setPhase("launch"); return; }
    void finishReturn(itemId);
  }, [open, phase, finishReturn]);


  const finishFromRequest = useCallback(async (itemId: string) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    clearResume();
    toast.success("Conexão concluída. Sincronizando lançamentos…");
    try {
      const { data: sync, error: syncError } = await supabase.functions.invoke("pluggy-sync-item", {
        body: { item_id: itemId, company_id: companyId },
      });
      if (syncError) throw syncError;
      onConnected?.({ itemId, connectionId: sync?.connection_id });
    } catch (syncError: unknown) {
      const info = await parseEdgeFunctionError(syncError, "Falha ao sincronizar a conexão");
      toast.error(info.message);
    }
    onOpenChange(false);
  }, [companyId, onConnected, onOpenChange]);

  /** Verifica no backend se a autorização feita no app do banco já concluiu. */
  const checkConnectRequest = useCallback(async (): Promise<boolean> => {
    const requestId = requestIdRef.current ?? readResume()?.connectRequestId ?? null;
    if (!requestId) return false;
    const { data } = await supabase
      .from("pluggy_connect_requests")
      .select("status, resolved_item_id")
      .eq("id", requestId)
      .maybeSingle();
    if (data?.status === "completed" && data.resolved_item_id) {
      await finishFromRequest(data.resolved_item_id);
      return true;
    }
    return false;
  }, [finishFromRequest]);

  const manualCheck = useCallback(async () => {
    setChecking(true);
    try {
      const done = await checkConnectRequest();
      if (!done) {
        const requestId = requestIdRef.current ?? readResume()?.connectRequestId ?? null;
        if (!requestId) {
          toast.info("Não encontramos a solicitação desta conexão. Inicie a conexão novamente.");
          return;
        }

        const { data: sync, error: syncError } = await supabase.functions.invoke("pluggy-sync-item", {
          body: { connect_request_id: requestId, company_id: companyId, first_connect: true },
        });
        if (syncError) {
          const info = await parseEdgeFunctionError(syncError, "A confirmação do banco ainda não foi localizada");
          toast.info(info.message);
          return;
        }

        const resolvedItemId = sync?.item_id as string | undefined;
        if (resolvedItemId) {
          finishedRef.current = true;
          clearResume();
          toast.success(`Conexão identificada: ${sync?.transactions ?? 0} lançamentos importados`);
          onConnected?.({ itemId: resolvedItemId, connectionId: sync?.connection_id });
          onOpenChange(false);
          return;
        }

        toast.info(
          (sync?.message as string | undefined)
            ?? "A autorização ainda não apareceu no Open Finance. Aguarde alguns instantes e verifique novamente.",
        );

      }
    } finally {
      setChecking(false);
    }
  }, [checkConnectRequest, companyId, onConnected, onOpenChange]);

  useEffect(() => {
    if (!open) {
      launchedRef.current = false;
      finishedRef.current = false;
      setError(null);
      setWidgetReady(false);
      setPending(false);
      try { instanceRef.current?.destroy?.(); } catch { /* noop */ }
      instanceRef.current = null;
      return;
    }
    if (phase !== "launch") return;
    if (launchedRef.current) return;

    launchedRef.current = true;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        await loadScript();

        // Retomada: reaproveita o connectToken salvo sempre que ele existir e
        // ainda estiver válido — independentemente dos parâmetros que o banco
        // devolveu na URL (Inter/OF por QR Code muitas vezes não devolve nada).
        const resume = readResume();
        let accessToken: string | undefined;
        let resumeItemId: string | undefined = itemIdToUpdate;
        let connectorIds: number[] | undefined;

        if (resume && resume.companyId === companyId) {
          requestIdRef.current = resume.connectRequestId ?? null;
          resumeItemId = resume.itemIdToUpdate ?? itemIdToUpdate;
          // Já concluiu via webhook enquanto o usuário estava no app do banco?
          if (await checkConnectRequest()) { setLoading(false); return; }
          accessToken = resume.accessToken;
          connectorIds = resume.connectorIds ?? undefined;
        }

        if (!accessToken) {
          const { data, error: e } = await supabase.functions.invoke("pluggy-connect-token", {
            body: {
              item_id: resumeItemId,
              company_id: companyId,
              oauth_redirect_uri: buildOauthRedirectUri(),
            },
          });
          if (e || !data?.accessToken) {
            const info = await parseEdgeFunctionError(e, "Não foi possível iniciar a conexão");
            throw new Error(info.message);
          }
          accessToken = data.accessToken as string;
          requestIdRef.current = data.connectRequestId ?? requestIdRef.current;
          // Sem solicitação registrada não há como concluir a conexão quando a
          // autorização termina fora do navegador (QR Code do banco).
          if (!resumeItemId && !requestIdRef.current) {
            throw new Error(
              "Não foi possível registrar a solicitação de conexão. Recarregue a página, confirme a empresa selecionada e tente novamente.",
            );
          }
          connectorIds = Array.isArray(data.connectorIds) && data.connectorIds.length
            ? (data.connectorIds as number[])
            : undefined;
        }

        // Persiste dados para conseguir retomar após redirect de OF.
        sessionStorage.setItem(
          RESUME_KEY,
          JSON.stringify({
            accessToken,
            companyId,
            itemIdToUpdate: resumeItemId,
            connectRequestId: requestIdRef.current,
            connectorIds: connectorIds ?? null,
            createdAt: Date.now(),
          } satisfies ResumeState),
        );

        const PluggyConnect = window.PluggyConnect!;
        const pc = new PluggyConnect({
          connectToken: accessToken,
          includeSandbox: false,
          updateItem: resumeItemId,
          // Só mostra conectores de Open Finance / login simples. Conectores
          // que pedem Client Id, Client Secret, chave privada e certificado
          // (ex.: "Inter Empresas") ficam fora da lista.
          ...(connectorIds ? { connectorIds } : {}),
          // Conectores Open Finance (C6, Itaú OF, Inter, etc.) exigem
          // redirecionar o topo do navegador para data.of.pluggy.ai / site do
          // banco. Sem oauthRedirectUri o widget tenta abrir em iframe e o
          // banco recusa via X-Frame-Options.
          oauthRedirectUri: buildOauthRedirectUri(),
          onSuccess: async (itemData: any) => {
            clearResume();
            finishedRef.current = true;
            const itemId = itemData?.item?.id ?? itemData?.itemId ?? itemData?.id;
            if (!itemId) { toast.error("Conexão sem item retornado"); onOpenChange(false); return; }
            toast.info("Conta conectada. Sincronizando últimos 30 dias…");
            try {
              const { data: sync, error: sErr } = await supabase.functions.invoke("pluggy-sync-item", {
                body: { item_id: itemId, company_id: companyId, first_connect: true },
              });
              if (sErr) throw sErr;
              toast.success(`Sincronização concluída: ${sync?.transactions ?? 0} lançamentos importados`);
              onConnected?.({ itemId, connectionId: sync?.connection_id });
            } catch (err) {
              console.error(err);
              const info = await parseEdgeFunctionError(err, "Falha ao sincronizar a conexão");
              toast.error(info.message);
            }
            onOpenChange(false);
          },
          onError: (err: any) => {
            console.error("PluggyConnect error", err);
            const described = describeConnectError({
              code: err?.code ?? err?.data?.code ?? null,
              message: err?.message ?? err?.data?.message ?? null,
            });
            setWidgetReady(false);
            setPending(false);
            setFailure(described);
            setPhase("failed");
          },

          onClose: () => {
            // Não limpa o resume: o usuário pode ter concluído no app do banco.
            setWidgetReady(false);
            setPending(true);
          },
        });
        instanceRef.current = pc;
        pc.init();
        setWidgetReady(true);
      } catch (e: any) {
        clearResume();
        setError(e?.message ?? "Falha ao iniciar Pluggy Connect");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, phase, companyId, itemIdToUpdate, onConnected, onOpenChange, checkConnectRequest]);

  // Polling curto enquanto a autorização acontece fora do navegador (QR Code).
  useEffect(() => {
    if (!open || !pending || finishedRef.current) return;
    let cancelled = false;
    let attempts = 0;
    const tick = async () => {
      if (cancelled || attempts >= 30) return; // ~90s
      attempts += 1;
      const done = await checkConnectRequest();
      if (!done && !cancelled) setTimeout(tick, 3000);
    };
    const t = setTimeout(tick, 3000);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, pending, checkConnectRequest]);

  // Widget da Pluggy gerencia seu próprio modal fullscreen.
  if (!open) return null;

  if (phase === "framed") return null;

  if (phase === "returning") {
    const itemId = returnedItemIdRef.current;
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label="Confirmando autorização do banco"
      >
        <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-lg">
          <h2 className="text-lg font-semibold">Confirmando a autorização com o banco…</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Recebemos o retorno do seu banco e estamos importando as contas e os lançamentos.
            Isso pode levar alguns instantes.
          </p>
          <div className="flex items-center justify-center py-6">
            {checking && <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />}
            {!checking && error && <p className="text-center text-sm text-destructive">{error}</p>}
          </div>
          {!checking && error && (
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => { returnedItemIdRef.current = null; setError(null); setPhase("launch"); }}>
                Conectar novamente
              </Button>
              <Button variant="outline" onClick={() => { clearResume(); onOpenChange(false); }}>
                Fechar
              </Button>
              <Button onClick={() => itemId && finishReturn(itemId)} disabled={!itemId}>
                Verificar novamente
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }






  if (phase === "intro") {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/80 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label="Antes de conectar via Open Finance"
      >
        <div className="w-full max-w-lg rounded-lg border bg-card p-6 shadow-lg">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
            <div>
              <h2 className="text-lg font-semibold">Antes de escolher o banco</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Na próxima tela, busque o seu banco pelo nome (ex.: <em>Banco do Brasil</em>,{" "}
                <em>Inter</em>, <em>Itaú</em>). Listamos apenas conectores{" "}
                <strong>Open Finance regulados</strong>: a autorização é feita no site ou no app do
                seu banco, e nós nunca guardamos a sua senha.
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-3 rounded-md border border-warning/40 bg-warning/10 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
            <p className="text-sm">
              Contas <strong>PJ</strong> de alguns bancos (Banco do Brasil, Bradesco, Santander)
              exigem no computador a instalação de um <strong>“Módulo de Segurança”</strong> próprio.
              Se essa tela aparecer, o mais rápido é concluir a autorização{" "}
              <strong>pelo celular</strong>, no app do banco.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowInterSteps((v) => !v)}
            aria-expanded={showInterSteps}
            className="mt-4 flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            O banco pediu “Instalar Módulo de Segurança”. E agora?
            <ChevronDown
              className={`h-4 w-4 transition-transform ${showInterSteps ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>
          {showInterSteps && (
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
              <li>Deixe esta janela aberta e não cancele a conexão.</li>
              <li>
                Quando o banco exibir um <strong>QR Code</strong>, leia-o com o app do banco
                (ex.: <em>BB Empresas</em>, <em>Inter Empresas</em>) e confirme a autorização lá.
              </li>
              <li>
                Se não houver QR Code, instale o Módulo de Segurança do banco e reinicie o
                computador — ou repita a conexão pelo <strong>celular</strong>, acessando o
                360°FOOD no navegador do telefone.
              </li>
              <li>
                Depois de autorizar, volte aqui e toque em{" "}
                <strong>“Já autorizei, verificar agora”</strong>. A importação também acontece
                sozinha quando o banco confirmar, mesmo que você feche a aba.
              </li>
            </ol>
          )}


          <label className="mt-5 flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <Checkbox
              checked={dontShowAgain}
              onCheckedChange={(v) => setDontShowAgain(v === true)}
            />
            Não mostrar novamente
          </label>

          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={startConnect}>Continuar para o banco</Button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "failed" && failure) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label="Falha na autorização do banco"
      >
        <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <h2 className="text-lg font-semibold">{failure.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{failure.message}</p>
            </div>
          </div>
          <p className="mt-4 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
            {failure.hint}
          </p>
          {failure.code && (
            <p className="mt-3 text-xs text-muted-foreground">Código do banco: {failure.code}</p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => { clearResume(); onOpenChange(false); }}>
              Fechar
            </Button>
            <Button onClick={retryConnect}>Tentar novamente</Button>
          </div>
        </div>
      </div>
    );
  }

  if (widgetReady && !error && !pending) return null;


  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Conectar via Open Finance"
    >
      <div className="mx-4 w-full max-w-md rounded-lg border bg-card p-6 shadow-lg">
        <h2 className="text-lg font-semibold">Conectar via Open Finance</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {loading
            ? "Preparando conexão segura…"
            : error
            ? "Não foi possível iniciar a conexão."
            : pending
            ? "Conexão em andamento. Conclua a autorização no app do seu banco (leitura do QR Code) — assim que o banco confirmar, importamos seus lançamentos automaticamente."
            : "Uma janela segura será aberta para você autenticar-se no seu banco."}
        </p>
        {pending && !error && (
          <>
            <p className="mt-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
              Travou na tela do banco pedindo o <strong>“Módulo de Segurança”</strong>? Autorize pelo
              app do banco no celular (leitura do QR Code) ou repita a conexão pelo navegador do
              telefone. Depois volte aqui e clique em “Já autorizei, verificar agora”.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Se apareceu uma tela de erro no site do banco, a autorização não foi concluída — use
              “Tentar novamente”.
            </p>
          </>
        )}

        <div className="flex items-center justify-center py-6">
          {(loading || (pending && !error)) && <Loader2 className="h-6 w-6 animate-spin text-primary" />}
          {error && <p className="text-sm text-destructive text-center">{error}</p>}
        </div>
        {(error || pending) && (
          <div className="flex justify-end gap-2">
            {pending && !error && (
              <Button onClick={manualCheck} disabled={checking}>
                {checking ? "Verificando…" : "Já autorizei, verificar agora"}
              </Button>
            )}
            <Button variant="outline" onClick={() => { clearResume(); onOpenChange(false); }}>
              Fechar
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
