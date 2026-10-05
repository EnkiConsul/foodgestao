import { maskPhone } from "@/lib/phone";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { KeyRound, Copy, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DpDialogShell } from "@/components/dp/DpDialogShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Item = { id: string; nome: string; cpf: string; whatsapp: string; tem_conta: boolean };

const MENSAGEM = `*Olá!* 👋

O *Portal do Colaborador da {Nome da Empresa}* está no ar para acompanhar suas informações e facilitar o seu dia a dia de trabalho!

📌 *O que você pode fazer por lá:*
✅ Consultar suas Escalas e Folgas
✅ Solicitar Férias
✅ Acessar seus Recibos e Documentos de DP
✅ Acompanhar Comunicados e Avisos da Empresa

🔐 *Como fazer o seu primeiro acesso:*
1. Acesse pelo navegador: *https://www.aveto360.com/login*
2. Digite o seu *CPF* (apenas números).
3. No primeiro acesso, você receberá um código de segurança de 6 dígitos no seu WhatsApp cadastrado para criar sua senha exclusiva.

👤 *Login:* Seu CPF (apenas números)
🔑 *Senha:* Você mesmo cria a sua no primeiro acesso. Ninguém da empresa tem acesso ou conhece sua senha.

⚠️ *Importante:*
Caso seu CPF não seja localizado ou você não receba o código, procure o gestor ou RH para conferir o número de WhatsApp cadastrado na sua ficha.

Vamos juntos modernizar nossa comunicação! 🚀`;

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

  const copiar = async () => {
    await navigator.clipboard.writeText(MENSAGEM.replace("{Nome da Empresa}", empresaNome || "nossa empresa"));
    toast.success("Mensagem copiada. Cole no grupo ou lista de transmissão da empresa.");
  };

  return (
    <DpDialogShell
      open={open} onOpenChange={onOpenChange} icon={KeyRound} size="lg"
      title="Gerar Acessos ao Portal"
      description="Cada colaborador cria a própria senha pelo CPF, com código enviado ao WhatsApp da ficha."
      footer={<>
        <Button variant="outline" onClick={copiar} disabled={loading}><Copy className="mr-2 h-4 w-4" />Copiar Mensagem do Portal</Button>
        {pendentes.length > 0 && (
          <Button onClick={salvar} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar Dados</Button>
        )}
      </>}
    >
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5"><CheckCircle2 className="h-4 w-4 text-primary" />{prontos} pronto(s) para o primeiro acesso</span>
            {pendentes.length > 0 && (
              <span className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-3 py-1.5"><AlertTriangle className="h-4 w-4 text-destructive" />{pendentes.length} faltando dados</span>
            )}
          </div>
          {pendentes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todos os colaboradores ativos têm CPF e WhatsApp. Copie a mensagem e envie para a equipe.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Preencha só o que falta e clique em Salvar Dados.</p>
              {pendentes.map((i) => {
                const e = edits[i.id] ?? {};
                const set = (k: "cpf" | "whatsapp", v: string) => setEdits((p) => ({ ...p, [i.id]: { ...p[i.id], [k]: v } }));
                return (
                  <div key={i.id} className="rounded-md border p-3">
                    <div className="mb-2 text-sm font-medium">{i.nome}</div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {!cpfOk(i.cpf) ? (
                        <Input inputMode="numeric" placeholder="CPF (apenas números)" maxLength={14} value={e.cpf ?? ""} onChange={(ev) => set("cpf", ev.target.value)} />
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
