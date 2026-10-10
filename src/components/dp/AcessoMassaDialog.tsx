import { maskPhone } from "@/lib/phone";
import { maskCpf } from "@/lib/cpf";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { KeyRound, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DpDialogShell } from "@/components/dp/DpDialogShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Item = { id: string; nome: string; cpf: string; whatsapp: string; tem_conta: boolean; ja_acessou?: boolean; bloqueado?: boolean };


const so = (v: string) => v.replace(/\D/g, "");
const cpfOk = (v: string) => so(v).length === 11;
const wppOk = (v: string) => { const d = so(v).replace(/^55(?=\d{10,11}$)/, ""); return d.length === 10 || d.length === 11; };

export function AcessoMassaDialog({ open, onOpenChange, companyId, empresaNome }: {
  open: boolean; onOpenChange: (o: boolean) => void; companyId: string | null; empresaNome?: string;
}) {
  const [itens, setItens] = useState<Item[]>([]);
  const [edits, setEdits] = useState<Record<string, { cpf?: string; whatsapp?: string }>>({});
  const [erros, setErros] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const carregar = async () => {
    if (!companyId) return;
    setLoading(true);
    const { data, error } = await supabase.rpc("dp_acesso_massa_analisar" as never, { p_company: companyId } as never);
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setItens((data as unknown as Item[]) ?? []);
    setEdits({}); setErros({});
  };
  useEffect(() => { if (open) void carregar(); }, [open, companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const pendentes = useMemo(() => itens.filter((i) => !cpfOk(i.cpf) || !wppOk(i.whatsapp)), [itens]);
  const prontos = itens.length - pendentes.length;

  const salvar = async () => {
    const lista = Object.entries(edits)
      .map(([id, e]) => ({ id, cpf: e.cpf ?? "", whatsapp: e.whatsapp ?? "" }))
      .filter((e) => e.cpf || e.whatsapp);
    if (!lista.length) { toast.info("Preencha CPF ou WhatsApp de pelo menos um colaborador."); return; }
    setSaving(true);
    const { data, error } = await supabase.rpc("dp_acesso_massa_completar" as never, { p_company: companyId, p_itens: lista } as never);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    const res = data as unknown as { salvos: number; erros: { id: string; motivo: string }[] };
    if (res.salvos) toast.success(`${res.salvos} cadastro(s) atualizado(s).`);
    await carregar();
    const map: Record<string, string> = {};
    res.erros.forEach((e) => { map[e.id] = e.motivo; });
    setErros(map);
    if (res.erros.length) toast.warning(`${res.erros.length} cadastro(s) com erro. Confira abaixo.`);
  };

  const semConta = useMemo(() => itens.filter((i) => !i.tem_conta && cpfOk(i.cpf) && wppOk(i.whatsapp)), [itens]);
  const [linksFalha, setLinksFalha] = useState<Record<string, string>>({});
  const [criando, setCriando] = useState<{ feitos: number; total: number } | null>(null);

  const aguardando = useMemo(() => itens.filter((i) => i.tem_conta && !i.ja_acessou && !i.bloqueado && cpfOk(i.cpf) && wppOk(i.whatsapp)), [itens]);
  const ativos = useMemo(() => itens.filter((i) => i.tem_conta && (i.ja_acessou || i.bloqueado)), [itens]);
  const [verAtivos, setVerAtivos] = useState(false);
  const [confirmar, setConfirmar] = useState<null | "novos" | "reenvio">(null);

  const criarEmMassa = async (origem: Item[] = semConta, reenvio = false) => {
    const fila = [...origem];
    const total = fila.length;
    let jaAtivos = 0;
    if (!fila.length) return;
    let ok = 0; let feitos = 0;
    const map: Record<string, string> = {};
    const links: Record<string, string> = {};
    setCriando({ feitos: 0, total: fila.length });
    const worker = async () => {
      while (fila.length) {
        const i = fila.shift()!;
        const { data, error } = await supabase.functions.invoke("dp-criar-acesso-colaborador", { body: { colaborador_id: i.id, enviar_whatsapp: true, somente_pendentes: reenvio } });
        const resp = data as { status?: string; error?: string; whatsapp_enviado?: boolean; whatsapp_erro?: string; activation_url?: string } | null;
        const msg = resp?.error;
        if (error || msg) {
          let motivo = msg;
          try { motivo = motivo || (await (error as { context?: Response })?.context?.json())?.error; } catch { /* ignora */ }
          map[i.id] = motivo || "Não foi possível criar o acesso. Tente novamente pela ficha.";
        } else if (resp?.whatsapp_enviado === false) {
          map[i.id] = `Acesso criado, mas a mensagem não foi enviada: ${resp.whatsapp_erro ?? "tente reenviar pela ficha."}`;
          if (resp.activation_url) links[i.id] = resp.activation_url;
        } else if (resp?.status === "ja_ativo") jaAtivos++;
        else ok++;
        feitos++;
        setCriando({ feitos, total });
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    setCriando(null);
    await carregar();
    setErros(map);
    setLinksFalha(links);
    if (ok) toast.success(`${ok} convite(s) enviado(s) pelo WhatsApp da Aveto.`);
    if (jaAtivos) toast.info(`${jaAtivos} colaborador(es) já criaram a senha e não receberam convite de novo.`);
    const falhas = Object.keys(map).length;
    if (falhas) toast.warning(`${falhas} colaborador(es) com problema. Veja o motivo na lista.`);
  };


  const Linha = ({ i, acao }: { i: Item; acao?: React.ReactNode }) => (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
      <span className="min-w-0 truncate font-medium">{i.nome}</span>{acao}
    </div>
  );

  const comErro = itens.filter((i) => erros[i.id] && !pendentes.includes(i));


  return (
    <DpDialogShell
      open={open} onOpenChange={(o) => { if (!o && criando) { toast.info("Aguarde terminar a criação dos acessos."); return; } onOpenChange(o); }} icon={KeyRound} size="lg"
      title="Gerar Acessos ao Portal"
      description="O sistema cria o acesso e envia o convite pelo WhatsApp da Aveto para o número da ficha de cada colaborador."
      footer={<>
        {pendentes.length > 0 && (
          <Button variant="outline" onClick={salvar} disabled={saving || !!criando}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar Dados</Button>
        )}
        {criando ? (
          <Button disabled><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enviando {criando.feitos}/{criando.total}</Button>
        ) : confirmar ? (
          <>
            <Button variant="ghost" onClick={() => setConfirmar(null)}>Voltar</Button>
            <Button onClick={() => { const c = confirmar; setConfirmar(null); void (c === "novos" ? criarEmMassa(semConta) : criarEmMassa(aguardando, true)); }}>
              Confirmar Envio para {confirmar === "novos" ? semConta.length : aguardando.length}
            </Button>
          </>
        ) : semConta.length > 0 ? (
          <Button onClick={() => setConfirmar("novos")} disabled={loading}>Liberar e Enviar para {semConta.length} Novo(s)</Button>
        ) : (
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        )}
      </>}
    >
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-4">
          {confirmar && (
            <p className="rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
              {confirmar === "novos"
                ? `Confirma o envio do convite pelo WhatsApp para ${semConta.length} colaborador(es) que ainda não têm acesso?`
                : `Confirma o reenvio do convite para ${aguardando.length} colaborador(es) que ainda não fizeram o 1º acesso? Quem já usa o portal não recebe nada.`}
            </p>
          )}
          {semConta.length > 0 && (
            <section className="space-y-2">
              <h4 className="flex items-center gap-1.5 text-sm font-semibold"><KeyRound className="h-4 w-4" />Prontos para liberar ({semConta.length})</h4>
              {semConta.map((i) => <Linha key={i.id} i={i} acao={<Button size="sm" variant="outline" disabled={!!criando} onClick={() => criarEmMassa([i])}>Liberar e Enviar</Button>} />)}
            </section>
          )}
          {aguardando.length > 0 && (
            <section className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="flex items-center gap-1.5 text-sm font-semibold"><AlertTriangle className="h-4 w-4 text-amber-600" />Aguardando 1º acesso ({aguardando.length})</h4>
                {aguardando.length > 1 && !confirmar && (
                  <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={!!criando} onClick={() => setConfirmar("reenvio")}>Reenviar para Todos</Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Já têm acesso liberado, mas ainda não entraram no portal.</p>
              {aguardando.map((i) => <Linha key={i.id} i={i} acao={<Button size="sm" variant="outline" disabled={!!criando} onClick={() => criarEmMassa([i], true)}>Reenviar Convite</Button>} />)}
            </section>
          )}
          <section className="space-y-2">
            <button type="button" className="flex items-center gap-1.5 text-sm font-semibold" onClick={() => setVerAtivos((v) => !v)}>
              <CheckCircle2 className="h-4 w-4 text-primary" />Já usam o portal ({ativos.length}) <span className="text-xs font-normal text-muted-foreground">{verAtivos ? "ocultar" : "ver nomes"}</span>
            </button>
            {verAtivos && ativos.map((i) => <Linha key={i.id} i={i} acao={i.bloqueado ? <span className="text-xs text-destructive">Bloqueado</span> : <span className="text-xs text-muted-foreground">Ativo</span>} />)}
          </section>
          {semConta.length === 0 && aguardando.length === 0 && pendentes.length === 0 && (
            <p className="text-sm text-muted-foreground">Todos os colaboradores ativos já usam o portal. Não há convites para enviar.</p>
          )}
          {comErro.length > 0 && (
            <div className="space-y-1 rounded-md border border-destructive/40 p-3">
              {comErro.map((i) => (
                <div key={i.id} className="flex flex-wrap items-center gap-2 text-xs">
                  <p><span className="font-medium">{i.nome}:</span> <span className="text-destructive">{erros[i.id]}</span></p>
                  {linksFalha[i.id] && (
                    <Button size="sm" variant="outline" className="h-7" onClick={async () => {
                      try { await navigator.clipboard.writeText(linksFalha[i.id]); toast.success(`Link de ${i.nome} copiado. Envie manualmente.`); }
                      catch { toast.error("Não foi possível copiar o link."); }
                    }}>Copiar Link</Button>
                  )}
                </div>
              ))}
            </div>
          )}
          {pendentes.length > 0 && (
            <div className="space-y-2">
              <h4 className="flex items-center gap-1.5 text-sm font-semibold"><AlertTriangle className="h-4 w-4 text-destructive" />Dados incompletos ({pendentes.length})</h4>
              <p className="text-sm text-muted-foreground">Preencha só o que falta e clique em Salvar Dados.</p>
              {pendentes.map((i) => {
                const e = edits[i.id] ?? {};
                const set = (k: "cpf" | "whatsapp", v: string) => setEdits((p) => ({ ...p, [i.id]: { ...p[i.id], [k]: v } }));
                return (
                  <div key={i.id} className="rounded-md border p-3">
                    <div className="mb-2 text-sm font-medium">{i.nome}</div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {!cpfOk(i.cpf) ? (
                        <Input inputMode="numeric" placeholder="CPF (apenas números)" maxLength={14} value={e.cpf ?? ""} onChange={(ev) => set("cpf", maskCpf(ev.target.value))} />
                      ) : <div className="text-xs text-muted-foreground self-center">CPF ok</div>}
                      {!wppOk(i.whatsapp) ? (
                        <Input inputMode="tel" placeholder="WhatsApp com DDD" maxLength={15} value={e.whatsapp ?? ""} onChange={(ev) => set("whatsapp", maskPhone(ev.target.value))} />
                      ) : <div className="text-xs text-muted-foreground self-center">WhatsApp ok</div>}
                    </div>
                    {erros[i.id] && <p className="mt-1 text-xs text-destructive">{erros[i.id]}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </DpDialogShell>
  );
}
