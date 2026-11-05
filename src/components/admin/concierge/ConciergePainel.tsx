import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useCnpjLookup } from "@/hooks/useCnpjLookup";
import { maskCnpj } from "@/lib/cnpj";
import { maskPhone } from "@/lib/phone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Copy, FileUp, Loader2, MessageCircle, RefreshCw, Sparkles, Search } from "lucide-react";

type Prov = {
  company_id: string; empresa: string; cnpj: string; gestor_nome: string; gestor_email: string | null;
  gestor_whatsapp: string | null; modulos: string[]; conta_existente: boolean; criado_em: string;
  whatsapp_enviado_em: string | null; email_enviado_em: string | null; link_aberto_em: string | null;
  ativado_em: string | null; convite_status: string | null; convite_expira_em: string | null; token: string | null;
  unidades: number; colaboradores: number; fichas: number;
};

const ERROS: Record<string, string> = {
  empresa_ja_cadastrada: "Já existe uma empresa com este CNPJ.",
  cnpj_invalido: "CNPJ inválido.",
  razao_social_obrigatoria: "Informe a razão social.",
  gestor_nome_obrigatorio: "Informe o nome do gestor.",
  gestor_contato_obrigatorio: "Informe o WhatsApp ou o e-mail do gestor.",
  email_invalido: "E-mail do gestor inválido.",
  nenhum_modulo_selecionado: "Escolha pelo menos um módulo.",
  sem_permissao: "Apenas super admin pode fazer isso.",
};
const traduz = (m: string) => Object.entries(ERROS).find(([k]) => m.includes(k))?.[1] ?? m;
const dt = (s: string | null) => (s ? new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : null);
const linkDe = (t: string) => `https://aveto360.com/convite/${t}`;

async function lerErro(error: unknown) {
  if (error instanceof FunctionsHttpError) {
    try { const j = await error.context.json(); return j?.error ?? error.message; } catch { return error.message; }
  }
  return error instanceof Error ? error.message : String(error);
}

const vazio = {
  cnpj: "", razao: "", fantasia: "", cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "",
  telefone: "", emailEmpresa: "", gestorNome: "", gestorEmail: "", gestorWhatsapp: "",
  dp: true, financeiro: false, criarUnidade: true,
};

export function ConciergePainel() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { setContext } = useCompanyContext();
  const [aberto, setAberto] = useState(false);
  const [f, setF] = useState(vazio);
  const lookup = useCnpjLookup();
  const set = (k: keyof typeof vazio, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));

  const { data: lista = [], isLoading } = useQuery({
    queryKey: ["admin-concierge"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_concierge_lista" as never);
      if (error) throw error;
      return (data ?? []) as unknown as Prov[];
    },
  });
  const recarregar = () => qc.invalidateQueries({ queryKey: ["admin-concierge"] });

  const buscarCnpj = async () => {
    try {
      const r = await lookup.mutateAsync(f.cnpj);
      setF((p) => ({
        ...p, razao: r.razao_social ?? p.razao, fantasia: r.nome_fantasia ?? p.fantasia, cep: r.cep ?? "",
        logradouro: r.logradouro ?? "", numero: r.numero ?? "", complemento: r.complemento ?? "", bairro: r.bairro ?? "",
        cidade: r.municipio ?? "", uf: r.uf ?? "", telefone: r.telefone ?? "", emailEmpresa: r.email ?? "",
      }));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao consultar CNPJ"); }
  };

  const criar = useMutation({
    mutationFn: async () => {
      const modulos = [f.dp && "dp", f.financeiro && "financeiro"].filter(Boolean) as string[];
      const { data, error } = await supabase.rpc("admin_provisionar_empresa_concierge" as never, {
        p_cnpj: f.cnpj, p_razao_social: f.razao, p_nome_fantasia: f.fantasia, p_cep: f.cep, p_logradouro: f.logradouro,
        p_numero: f.numero, p_complemento: f.complemento, p_bairro: f.bairro, p_cidade: f.cidade, p_uf: f.uf,
        p_telefone_empresa: f.telefone, p_email_empresa: f.emailEmpresa, p_gestor_nome: f.gestorNome,
        p_gestor_email: f.gestorEmail, p_gestor_whatsapp: f.gestorWhatsapp, p_modulos: modulos, p_criar_unidade: f.criarUnidade,
      } as never);
      if (error) throw new Error(traduz(error.message));
      return data as unknown as { company_id: string };
    },
    onSuccess: () => {
      toast.success("Empresa preparada. Agora carregue as fichas e envie o acesso.");
      setAberto(false); setF(vazio); recarregar(); qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const enviar = useMutation({
    mutationFn: async (companyId: string) => {
      const { data, error } = await supabase.functions.invoke("concierge-entregar-acesso", { body: { companyId } });
      if (error) throw new Error(await lerErro(error));
      return data as { whatsapp: boolean; email: boolean; whatsappErro?: string | null };
    },
    onSuccess: (r) => {
      if (r.whatsapp || r.email) toast.success(`Acesso enviado${r.whatsapp ? " pelo WhatsApp" : ""}${r.whatsapp && r.email ? " e" : ""}${r.email ? " por e-mail" : ""}.`);
      else toast.error(`Não foi possível enviar${r.whatsappErro ? ` (WhatsApp: ${r.whatsappErro})` : ""}. Copie o link e envie manualmente.`);
      recarregar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const renovar = useMutation({
    mutationFn: async (companyId: string) => {
      const { error } = await supabase.rpc("admin_concierge_renovar_convite" as never, { p_company_id: companyId } as never);
      if (error) throw new Error(traduz(error.message));
    },
    onSuccess: () => { toast.success("Novo link gerado (válido por 15 dias)."); recarregar(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const abrirFichas = (id: string) => {
    setContext("pj", id);
    qc.invalidateQueries();
    navigate("/dp/colaboradores/importar-ficha");
  };

  const podeCriar = f.cnpj.replace(/\D/g, "").length === 14 && f.razao.trim() && f.gestorNome.trim()
    && (f.gestorEmail.trim() || f.gestorWhatsapp.replace(/\D/g, "").length >= 10) && (f.dp || f.financeiro);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 space-y-0 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-base">Empresas preparadas pela Aveto</CardTitle>
          <p className="text-sm text-muted-foreground">Crie a empresa, carregue as fichas e envie o acesso ao gestor. O teste grátis começa quando ele criar a senha.</p>
        </div>
        <Button onClick={() => setAberto(true)}><Sparkles className="mr-2 h-4 w-4" />Preparar Empresa</Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : lista.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma empresa preparada ainda.</p>
        ) : lista.map((p) => {
          const expirado = !p.ativado_em && (p.convite_status !== "pending" || (p.convite_expira_em && new Date(p.convite_expira_em) < new Date()));
          return (
            <div key={p.company_id} className="rounded-md border p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{p.empresa}</span>
                <span className="text-xs text-muted-foreground">{maskCnpj(p.cnpj ?? "")}</span>
                {p.ativado_em ? <Badge>Ativo desde {dt(p.ativado_em)}</Badge>
                  : expirado ? <Badge variant="destructive">Link expirado</Badge>
                  : <Badge variant="secondary">Aguardando senha</Badge>}
                {p.conta_existente && <Badge variant="outline">Gestor já tem conta</Badge>}
              </div>
              <div className="text-xs text-muted-foreground">
                Gestor: {p.gestor_nome}{p.gestor_whatsapp ? ` · ${maskPhone(p.gestor_whatsapp)}` : ""}{p.gestor_email ? ` · ${p.gestor_email}` : ""}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <div>Lojas: <b>{p.unidades}</b></div>
                <div>Colaboradores: <b>{p.colaboradores}</b> {p.fichas > 0 && <span className="text-muted-foreground">({p.fichas} importações)</span>}</div>
                <div>Envio: <b>{dt(p.whatsapp_enviado_em) ?? dt(p.email_enviado_em) ?? "não enviado"}</b></div>
                <div>Link: <b>{p.link_aberto_em ? `aberto ${dt(p.link_aberto_em)}` : "não aberto"}</b></div>
              </div>
              {!p.ativado_em && (
                <div className="flex flex-wrap gap-2">
                  {p.modulos.includes("dp") && (
                    <Button size="sm" variant="outline" onClick={() => abrirFichas(p.company_id)}><FileUp className="mr-1 h-4 w-4" />Importar Fichas</Button>
                  )}
                  {expirado ? (
                    <Button size="sm" variant="outline" disabled={renovar.isPending} onClick={() => renovar.mutate(p.company_id)}><RefreshCw className="mr-1 h-4 w-4" />Gerar Novo Link</Button>
                  ) : (
                    <>
                      <Button size="sm" disabled={enviar.isPending} onClick={() => enviar.mutate(p.company_id)}>
                        {enviar.isPending && enviar.variables === p.company_id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-1 h-4 w-4" />}
                        {p.whatsapp_enviado_em || p.email_enviado_em ? "Reenviar Acesso" : "Enviar Acesso"}
                      </Button>
                      {p.token && (
                        <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(linkDe(p.token!)); toast.success("Link copiado"); }}>
                          <Copy className="mr-1 h-4 w-4" />Copiar Link
                        </Button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Preparar Empresa para o Cliente</DialogTitle>
            <DialogDescription>A empresa fica com a Aveto até o gestor criar a senha; depois ele vira o Dono e a Aveto sai.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>CNPJ *</Label>
              <div className="flex gap-2">
                <Input inputMode="numeric" value={f.cnpj} onChange={(e) => set("cnpj", maskCnpj(e.target.value))} placeholder="00.000.000/0000-00" />
                <Button type="button" variant="outline" onClick={buscarCnpj} disabled={lookup.isPending || f.cnpj.replace(/\D/g, "").length !== 14}>
                  {lookup.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}<span className="ml-1">Buscar</span>
                </Button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1"><Label>Razão social *</Label><Input value={f.razao} onChange={(e) => set("razao", e.target.value)} /></div>
              <div className="space-y-1"><Label>Nome fantasia</Label><Input value={f.fantasia} onChange={(e) => set("fantasia", e.target.value)} /></div>
            </div>
            {f.cidade && <p className="text-xs text-muted-foreground">{[f.logradouro, f.numero, f.bairro, f.cidade, f.uf].filter(Boolean).join(", ")}</p>}

            <div className="space-y-3 rounded-md border p-3">
              <p className="text-sm font-medium">Gestor (quem vai receber o acesso)</p>
              <div className="space-y-1"><Label>Nome completo *</Label><Input value={f.gestorNome} onChange={(e) => set("gestorNome", e.target.value)} /></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label>WhatsApp</Label><Input inputMode="tel" value={f.gestorWhatsapp} onChange={(e) => set("gestorWhatsapp", maskPhone(e.target.value))} placeholder="(00) 00000-0000" /></div>
                <div className="space-y-1"><Label>E-mail</Label><Input type="email" value={f.gestorEmail} onChange={(e) => set("gestorEmail", e.target.value)} /></div>
              </div>
              <p className="text-xs text-muted-foreground">Informe ao menos um. Com e-mail, ele entra pelo e-mail; só com WhatsApp, entra pelo número.</p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Módulos do teste grátis</p>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.dp} onCheckedChange={(v) => set("dp", !!v)} />Pessoas 360°</label>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.financeiro} onCheckedChange={(v) => set("financeiro", !!v)} />Financeiro 360°</label>
              {f.dp && (
                <label className="flex items-center gap-2 text-sm text-muted-foreground"><Checkbox checked={f.criarUnidade} onCheckedChange={(v) => set("criarUnidade", !!v)} />Criar a primeira loja com os dados da empresa</label>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button disabled={!podeCriar || criar.isPending} onClick={() => criar.mutate()}>
              {criar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Criar Empresa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
