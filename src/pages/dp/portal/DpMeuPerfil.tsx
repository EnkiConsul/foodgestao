import { Helmet } from "react-helmet-async";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil, Save, X, User } from "lucide-react";
import { DpContentCard, DpEmptyState, DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { DpErrorState } from "@/components/dp/DpErrorState";
import { CardListSkeleton } from "@/components/dp/DpSkeletons";
import { EnderecoFields } from "@/components/shared/EnderecoFields";
import {
  CONTA_TIPOS, PIX_TIPOS, PAGAMENTO_BLANK, erroPagamento, pagamentoDoRegistro,
  pagamentoParaBanco, pixTipoRecomendado, type DadosPagamento,
} from "@/lib/dp/dadosPagamento";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { notifyError } from "@/lib/notifyError";
import { useMeuVinculoPortal } from "@/hooks/useMeuVinculoPortal";

export default function DpMeuPerfil() {
  const { user } = useAuth();
  const qc = useQueryClient();
  // Identidade resolvida no servidor a partir da sessão (fonte única).
  const vinculo = useMeuVinculoPortal();
  const colaboradorId = vinculo.data?.colaboradorId ?? null;
  const perfil = useQuery({
    queryKey: ["dp_meu_perfil", user?.id, colaboradorId],
    enabled: !!user?.id && !!colaboradorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_colaboradores")
        // Colunas explícitas de propósito: o portal nunca deve trazer campos
        // internos do RH (ex.: notas/ressalvas do desligamento).
        .select(
          [
            "id",
            "nome",
            "nome_social",
            "matricula",
            "cpf",
            "cargo",
            "regime",
            "perfil_acesso",
            "data_admissao",
            "data_nascimento",
            "email",
            "email_portal",
            "email_contato",
            "telefone",
            "whatsapp",
            "endereco",
            "banco_codigo",
            "banco_nome",
            "agencia",
            "conta",
            "conta_digito",
            "conta_tipo",
            "titular_proprio",
            "titular_nome",
            "titular_cpf",
            "pix_tipo",
            "pix_chave",
            "recebe_em_especie",
            "dp_unidades(nome)",
            "dp_cargos(nome)",
            "dp_sindicatos(nome)",
          ].join(", "),
        )
        .eq("id", colaboradorId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [editing, setEditing] = useState(false);
  const [pagamento, setPagamento] = useState<DadosPagamento>(PAGAMENTO_BLANK);
  const [form, setForm] = useState({
    telefone: "", whatsapp: "", email_contato: "",
    endereco: { logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "", cep: "" },
  });

  useEffect(() => {
    const p = perfil.data as any;
    if (!p) return;
    setForm({
      telefone: p.telefone ?? "",
      whatsapp: p.whatsapp ?? "",
      email_contato: p.email_contato ?? "",
      endereco: {
        logradouro: p.endereco?.logradouro ?? "",
        numero: p.endereco?.numero ?? "",
        complemento: p.endereco?.complemento ?? "",
        bairro: p.endereco?.bairro ?? "",
        cidade: p.endereco?.cidade ?? "",
        uf: p.endereco?.uf ?? "",
        cep: p.endereco?.cep ?? "",
      },
    });
    setPagamento(pagamentoDoRegistro(p as Record<string, unknown>));
  }, [perfil.data]);

  const save = useMutation({
    mutationFn: async () => {
      const p = perfil.data as any;
      if (!p) throw new Error("Perfil não encontrado");
      const problema = erroPagamento(pagamento);
      if (problema) throw new Error(problema);
      const { error } = await supabase.from("dp_colaboradores").update({
        telefone: form.telefone || null,
        whatsapp: form.whatsapp || null,
        email_contato: form.email_contato || null,
        endereco: form.endereco,
        // A empresa é quem define recebimento em espécie; o portal só grava conta/Pix.
        ...(() => {
          const { recebe_em_especie: _ignorado, ...resto } = pagamentoParaBanco(pagamento);
          return p.recebe_em_especie === true ? {} : resto;
        })(),
      }).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Perfil atualizado");
      qc.invalidateQueries({ queryKey: ["dp_meu_perfil"] });
      setEditing(false);
    },
    onError: (e: any) => notifyError(e, { surface: "Meu perfil", action: "concluir a ação", fallback: "Erro" }),
  });

  const p = perfil.data as any;

  return (
    <DpPage>
      <Helmet><title>Meu Cadastro — Portal</title></Helmet>
      <DpPageHeader
        icon={User}
        title="Meu Cadastro"
        actions={p && !editing ? (
          <Button variant="outline" onClick={() => setEditing(true)} className="min-h-10 w-full sm:w-auto">
            <Pencil className="h-4 w-4 mr-1" /> Editar meus dados
          </Button>
        ) : undefined}
      />
      {perfil.isError ? (
        <DpContentCard contentClassName="p-4"><DpErrorState onRetry={() => perfil.refetch()} /></DpContentCard>
      ) : perfil.isLoading ? (
        <CardListSkeleton rows={2} />
      ) : !p ? (
        <DpContentCard contentClassName="p-6"><DpEmptyState icon={User}>Ainda não encontramos seu cadastro. Fale com o setor de pessoas.</DpEmptyState></DpContentCard>

      ) : (
        <>
          <Card className="dp-content-card">
            <CardHeader><CardTitle>{p.nome}</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
              <Field label="Matrícula" value={p.matricula} />
              <Field label="CPF" value={p.cpf} />
              <Field label="Cargo" value={p.dp_cargos?.nome ?? p.cargo} />
              <Field label="Unidade" value={p.dp_unidades?.nome} />
              <Field label="Regime" value={p.regime} />
              <Field label="Perfil de acesso" value={p.perfil_acesso} />
              <Field label="Sindicato" value={p.dp_sindicatos?.nome} />
              <Field label="Admissão" value={p.data_admissao} />
              <Field label="Nascimento" value={p.data_nascimento} />
              <Field label="E-mail corporativo" value={p.email} />
              <Field label="E-mail do portal" value={p.email_portal} />
            </CardContent>
          </Card>

          <Card className="dp-content-card">
            <CardHeader><CardTitle className="text-base">Contato & Endereço</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {editing ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label htmlFor="telefone-1">Telefone</Label><Input id="telefone-1" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></div>
                    <div><Label htmlFor="whatsapp-2">WhatsApp</Label><Input id="whatsapp-2" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} /></div>
                  </div>
                  <div><Label htmlFor="e-mail-pessoal-3">E-mail pessoal</Label><Input id="e-mail-pessoal-3" type="email" value={form.email_contato} onChange={(e) => setForm({ ...form, email_contato: e.target.value })} /></div>
                  <EnderecoFields
                    idPrefix="perfil"
                    valor={form.endereco}
                    onChange={(patch) =>
                      setForm((f) => ({ ...f, endereco: { ...f.endereco, ...patch } }))
                    }
                  />
                  <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-2">
                    <Button variant="outline" onClick={() => setEditing(false)} className="min-h-10 w-full sm:w-auto"><X className="h-4 w-4 mr-1" /> Cancelar</Button>
                    <Button disabled={save.isPending} onClick={() => save.mutate()} className="min-h-10 w-full sm:w-auto"><Save className="h-4 w-4 mr-1" /> Salvar</Button>
                  </div>
                </>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 text-sm">
                  <Field label="Telefone" value={p.telefone} />
                  <Field label="WhatsApp" value={p.whatsapp} />
                  <Field label="E-mail pessoal" value={p.email_contato} />
                  <Field label="Endereço" value={
                    p.endereco ? [p.endereco.logradouro, p.endereco.numero, p.endereco.complemento, p.endereco.bairro, p.endereco.cidade, p.endereco.uf, p.endereco.cep].filter(Boolean).join(", ") : null
                  } />
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="dp-content-card">
            <CardHeader><CardTitle className="text-base">Dados Para Pagamento</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {p.recebe_em_especie === true ? (
                <p className="text-sm text-muted-foreground">
                  Sua empresa registrou que você recebe em espécie. Nada a informar aqui.
                </p>
              ) : editing ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    Informe a conta bancária ou a chave Pix — um dos dois é suficiente.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="perfil-banco">Banco</Label>
                      <Input id="perfil-banco" value={pagamento.banco_nome}
                        onChange={(e) => setPagamento({ ...pagamento, banco_nome: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="perfil-agencia">Agência</Label>
                      <Input id="perfil-agencia" value={pagamento.agencia}
                        onChange={(e) => setPagamento({ ...pagamento, agencia: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="perfil-conta">Conta</Label>
                      <Input id="perfil-conta" value={pagamento.conta}
                        onChange={(e) => setPagamento({ ...pagamento, conta: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="perfil-conta-digito">Dígito</Label>
                      <Input id="perfil-conta-digito" value={pagamento.conta_digito}
                        onChange={(e) => setPagamento({ ...pagamento, conta_digito: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="perfil-conta-tipo">Tipo de conta</Label>
                      <Select value={pagamento.conta_tipo || "none"}
                        onValueChange={(v) => setPagamento({ ...pagamento, conta_tipo: v === "none" ? "" : v })}>
                        <SelectTrigger id="perfil-conta-tipo"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Não informado</SelectItem>
                          {CONTA_TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="perfil-pix-tipo">Tipo da chave Pix</Label>
                      <Select value={pagamento.pix_tipo || "none"}
                        onValueChange={(v) => setPagamento({ ...pagamento, pix_tipo: v === "none" ? "" : v })}>
                        <SelectTrigger id="perfil-pix-tipo"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Não informado</SelectItem>
                          {PIX_TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="sm:col-span-2">
                      <Label htmlFor="perfil-pix-chave">Chave Pix</Label>
                      <Input id="perfil-pix-chave" value={pagamento.pix_chave}
                        onChange={(e) => setPagamento({ ...pagamento, pix_chave: e.target.value })} />
                      {pagamento.pix_tipo && !pixTipoRecomendado(pagamento.pix_tipo) && (
                        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                          O recomendado é a chave de CPF ou de celular.
                        </p>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    A conta ou a chave Pix precisa estar no seu nome.
                  </p>
                </>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 text-sm">
                  <Field label="Banco" value={p.banco_nome} />
                  <Field label="Agência" value={p.agencia} />
                  <Field label="Conta" value={p.conta ? `${p.conta}${p.conta_digito ? `-${p.conta_digito}` : ""}` : null} />
                  <Field label="Tipo de conta" value={CONTA_TIPOS.find((t) => t.value === p.conta_tipo)?.label} />
                  <Field label="Chave Pix" value={p.pix_chave} />
                  <Field label="Tipo da chave" value={PIX_TIPOS.find((t) => t.value === p.pix_tipo)?.label} />
                  {p.titular_proprio === false && <Field label="Titular" value={p.titular_nome} />}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </DpPage>
  );
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value ?? "—"}</p>
    </div>
  );
}
