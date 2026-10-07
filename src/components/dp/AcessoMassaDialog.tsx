import { maskPhone } from "@/lib/phone";
import { maskCpf } from "@/lib/cpf";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { KeyRound, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DpDialogShell } from "@/components/dp/DpDialogShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Item = { id: string; nome: string; cpf: string; whatsapp: string; tem_conta: boolean };


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
  const [criando, setCriando] = useState<{ feitos: number; total: number } | null>(null);

  const criarEmMassa = async () => {
    const fila = [...semConta];
    if (!fila.length) return;
    let ok = 0; let feitos = 0;
    const map: Record<string, string> = {};
    setCriando({ feitos: 0, total: fila.length });
    const worker = async () => {
      while (fila.length) {
        const i = fila.shift()!;
        const { data, error } = await supabase.functions.invoke("dp-criar-acesso-colaborador", { body: { colaborador_id: i.id, enviar_whatsapp: true } });
        const resp = data as { error?: string; whatsapp_enviado?: boolean; whatsapp_erro?: string } | null;
        const msg = resp?.error;
        if (error || msg) {
          let motivo = msg;
          try { motivo = motivo || (await (error as { context?: Response })?.context?.json())?.error; } catch { /* ignora */ }
          map[i.id] = motivo || "Não foi possível criar o acesso. Tente novamente pela ficha.";
        } else if (resp?.whatsapp_enviado === false) {
          map[i.id] = `Acesso criado, mas a mensagem não foi enviada: ${resp.whatsapp_erro ?? "tente reenviar pela ficha."}`;
        } else ok++;
        feitos++;
        setCriando({ feitos, total: semConta.length });
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    setCriando(null);
    await carregar();
    setErros(map);
    if (ok) toast.success(`${ok} acesso(s) criado(s) e convite(s) enviado(s) pelo WhatsApp da Aveto.`);
    const falhas = Object.keys(map).length;
    if (falhas) toast.warning(`${falhas} colaborador(es) com problema. Veja o motivo na lista.`);
  };

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
        {semConta.length > 0 && (
          <Button onClick={criarEmMassa} disabled={loading || !!criando}>
            {criando ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enviando {criando.feitos}/{criando.total}</> : <>Criar e Enviar {semConta.length} Convite(s)</>}
          </Button>
        )}
      </>}
    >
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5"><CheckCircle2 className="h-4 w-4 text-primary" />{itens.filter((i) => i.tem_conta).length} com acesso já liberado</span>
            <span className="flex items-center gap-1.5 rounded-md bg-muted px-3 py-1.5"><KeyRound className="h-4 w-4" />{semConta.length} pronto(s) para liberar</span>
            {pendentes.length > 0 && (
              <span className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-3 py-1.5"><AlertTriangle className="h-4 w-4 text-destructive" />{pendentes.filter((i) => !i.tem_conta).length} com dados incompletos</span>
            )}
          </div>
          {comErro.length > 0 && (
            <div className="space-y-1 rounded-md border border-destructive/40 p-3">
              {comErro.map((i) => <p key={i.id} className="text-xs"><span className="font-medium">{i.nome}:</span> <span className="text-destructive">{erros[i.id]}</span></p>)}
            </div>
          )}
          {pendentes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {semConta.length > 0
                ? "Clique em Criar e Enviar Convites: cada colaborador recebe a mensagem no WhatsApp da ficha, sem você precisar copiar nada."
                : "Todos os colaboradores ativos já têm acesso. Para reenviar o convite ou uma nova senha, use a aba Acesso da ficha."}
            </p>
          ) : (
            <div className="space-y-2">
              {semConta.length > 0 && (
                <p className="rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
                  {semConta.length} colaborador(es) já estão prontos. Você já pode clicar em "Criar e Enviar {semConta.length} Convite(s)" agora; os {pendentes.length} abaixo você pode completar quando tiver os dados.
                </p>
              )}
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
