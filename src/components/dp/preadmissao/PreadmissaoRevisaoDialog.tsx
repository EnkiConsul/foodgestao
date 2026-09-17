/**
 * Revisão da Pré-Admissão pelo gestor.
 *
 * Mostra o que o candidato preencheu e enviou, o que ainda falta, o bloqueio de
 * menor de 18 com trabalho após as 22h e conduz o caminho: pedir correção,
 * preparar para a contabilidade, marcar o envio, anexar a ficha oficial
 * devolvida e, só então, concluir a admissão pela conferência da ficha.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Clock, Eye, FileUp, Loader2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { notifyError } from "@/lib/notifyError";
import {
  PREADMISSAO_STATUS_LABEL, abrirDocumentoPreadmissao, anexarFichaOficial,
  useDpPreadmissao, useDpPreadmissaoGestor, type PreadmissaoStatus,
} from "@/hooks/dp/useDpPreadmissoes";

const REGIMES = [
  { value: "clt", label: "CLT efetivo" },
  { value: "intermitente", label: "CLT intermitente" },
  { value: "estagio", label: "Estagiário" },
  { value: "temporario", label: "Temporário" },
  { value: "pj", label: "PJ / Sócio" },
  { value: "mei", label: "MEI" },
  { value: "freelancer", label: "Freelancer (sem registro)" },
];

const FORMAS = [
  { value: "mensal", label: "Mensal" },
  { value: "quinzenal", label: "Quinzenal" },
  { value: "semanal", label: "Semanal" },
  { value: "diaria", label: "Diária" },
  { value: "horista", label: "Por hora" },
];

/** Campos da ficha mostrados na conferência, em linguagem de tela. */
const CAMPOS_FICHA: Array<[string, string]> = [
  ["nome", "Nome"], ["cpf", "CPF"], ["data_nascimento", "Nascimento"], ["sexo", "Sexo"],
  ["estado_civil", "Estado civil"], ["nome_mae", "Nome da mãe"], ["nome_pai", "Nome do pai"],
  ["grau_instrucao", "Escolaridade"], ["telefone", "Telefone"], ["email", "E-mail"],
  ["cep", "CEP"], ["endereco", "Endereço"], ["numero", "Número"], ["bairro", "Bairro"],
  ["cidade", "Cidade"], ["uf", "UF"], ["rg_numero", "RG"], ["pis", "PIS"],
  ["ctps_numero", "CTPS"], ["titulo_eleitor", "Título de eleitor"],
  ["reservista", "Reservista"],
];

interface Props {
  preadmissaoId: string | null;
  onOpenChange: (open: boolean) => void;
}

export function PreadmissaoRevisaoDialog({ preadmissaoId, onOpenChange }: Props) {
  const navigate = useNavigate();
  const { data, isLoading, refetch } = useDpPreadmissao(preadmissaoId);
  const acoes = useDpPreadmissaoGestor(preadmissaoId);
  const [motivo, setMotivo] = useState("");
  const [admin, setAdmin] = useState<Record<string, string>>({});
  const fichaRef = useRef<HTMLInputElement>(null);
  const [enviandoFicha, setEnviandoFicha] = useState(false);

  const pa = data?.preadmissao;
  const status = (pa?.status ?? "aguardando_preenchimento") as PreadmissaoStatus;
  const dados = (pa?.dados ?? {}) as Record<string, unknown>;

  useEffect(() => {
    const a = (pa?.admin_dados ?? {}) as Record<string, unknown>;
    setAdmin({
      data_admissao: String(a.data_admissao ?? ""),
      regime_trabalho: String(a.regime_trabalho ?? ""),
      salario: String(a.salario ?? ""),
      forma_pagamento: String(a.forma_pagamento ?? ""),
      jornada_descricao: String(a.jornada_descricao ?? ""),
    });
  }, [pa?.id, pa?.admin_dados]);

  const vigentes = useMemo(() => (data?.documentos ?? []).filter((d) => !d.substituido_em), [data?.documentos]);
  const nomePessoa = (id: string | null) =>
    id ? (data?.pessoas ?? []).find((p) => p.id === id)?.nome ?? "Familiar" : "O candidato";

  const ver = async (documentoId: string) => {
    try {
      const url = await abrirDocumentoPreadmissao(documentoId);
      window.open(url, "_blank", "noopener");
    } catch (e) {
      notifyError(e as Error, { surface: "Pessoas 360°", action: "abrir o documento" });
    }
  };

  const executar = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      refetch();
    } catch (e) {
      notifyError(e as Error, { surface: "Pessoas 360°", action: "concluir a ação" });
    }
  };

  const enviarFichaOficial = async (arquivo: File, conferida: boolean) => {
    setEnviandoFicha(true);
    try {
      await anexarFichaOficial(preadmissaoId!, arquivo, conferida);
      toast.success(conferida ? "Ficha oficial anexada e conferida" : "Ficha oficial anexada");
      refetch();
    } catch (e) {
      notifyError(e as Error, { surface: "Pessoas 360°", action: "anexar a ficha oficial" });
    } finally {
      setEnviandoFicha(false);
    }
  };

  return (
    <Dialog open={!!preadmissaoId} onOpenChange={(v) => !v && onOpenChange(false)}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{pa?.candidato_nome ?? "Pré-Admissão"}</DialogTitle>
          <DialogDescription>
            {PREADMISSAO_STATUS_LABEL[status]} · {pa?.whatsapp ?? ""}
          </DialogDescription>
        </DialogHeader>

        {isLoading || !pa ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Carregando a ficha…
          </div>
        ) : (
          <div className="space-y-5">
            {data.bloqueio.situacao !== "ok" && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <p className="font-semibold flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-4 w-4" /> Atenção
                </p>
                <p className="text-muted-foreground">{data.bloqueio.mensagem}</p>
              </div>
            )}

            {pa.correcao_motivo && status === "correcao_solicitada" && (
              <div className="rounded-lg border p-3 text-sm">
                <p className="font-semibold">Correção pedida ao candidato</p>
                <p className="text-muted-foreground">{pa.correcao_motivo}</p>
              </div>
            )}

            <section>
              <h3 className="text-sm font-semibold mb-2">Dados Informados Pelo Candidato</h3>
              <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2 text-sm">
                {CAMPOS_FICHA.map(([k, rotulo]) => (
                  <div key={k} className="flex justify-between gap-2 border-b border-dashed py-1">
                    <span className="text-muted-foreground">{rotulo}</span>
                    <span className="text-right">{String(dados[k] ?? "—") || "—"}</span>
                  </div>
                ))}
              </div>
            </section>

            {!!data.pessoas.length && (
              <section>
                <h3 className="text-sm font-semibold mb-2">Familiares Informados</h3>
                <div className="space-y-2">
                  {data.pessoas.map((p) => (
                    <div key={p.id} className="rounded-lg border p-2 text-sm flex flex-wrap items-center gap-2">
                      <span className="font-medium">{p.nome}</span>
                      <span className="text-muted-foreground text-xs">
                        {p.parentesco ?? "Parentesco não informado"}
                        {p.data_nascimento ? ` · ${new Date(p.data_nascimento).toLocaleDateString("pt-BR")}` : ""}
                      </span>
                      {p.finalidade_dependente && <Badge variant="outline">Dependente</Badge>}
                      {p.finalidade_sesc && <Badge variant="outline">Sesc</Badge>}
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h3 className="text-sm font-semibold mb-2">Documentos Enviados</h3>
              {!vigentes.length && <p className="text-sm text-muted-foreground">Nenhum documento enviado ainda.</p>}
              <div className="space-y-2">
                {vigentes.map((d) => (
                  <div key={d.id} className="rounded-lg border p-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{d.requisito_codigo.replace(/_/g, " ")}</span>
                      <span className="text-xs text-muted-foreground">{nomePessoa(d.pessoa_id)}</span>
                      {d.status === "aprovado" && <Badge variant="outline" className="text-emerald-600">Aprovado</Badge>}
                      {d.status === "recusado" && <Badge variant="destructive">Recusado</Badge>}
                      {d.status === "pendente" && <Badge variant="secondary">Em análise</Badge>}
                      <div className="ml-auto flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => ver(d.id)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            executar(
                              () => acoes.avaliarDocumento.mutateAsync({ documento_id: d.id, status: "aprovado" }),
                              "Documento aprovado",
                            )}
                        >
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const m = window.prompt("Por que este documento foi recusado?") ?? "";
                            if (m.trim().length < 5) return;
                            executar(
                              () =>
                                acoes.avaliarDocumento.mutateAsync({
                                  documento_id: d.id, status: "recusado", motivo: m.trim(),
                                }),
                              "Documento recusado",
                            );
                          }}
                        >
                          <XCircle className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    {d.motivo_recusa && <p className="text-xs text-destructive mt-1">{d.motivo_recusa}</p>}
                  </div>
                ))}
              </div>
              {!!data.pendencias.length && (
                <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
                  <p className="font-semibold flex items-center gap-2">
                    <Clock className="h-4 w-4" /> Ainda faltam
                  </p>
                  <ul className="list-disc pl-5 text-muted-foreground">
                    {data.pendencias.map((p) => (
                      <li key={p.key}>{p.titulo}{p.pessoa_nome ? ` — ${p.pessoa_nome}` : ""}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <Separator />

            <section>
              <h3 className="text-sm font-semibold mb-2">Informações Da Empresa (Para A Contabilidade)</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Data de admissão</Label>
                  <Input type="date" className="h-10" value={admin.data_admissao}
                    onChange={(e) => setAdmin({ ...admin, data_admissao: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Vínculo</Label>
                  <Select value={admin.regime_trabalho} onValueChange={(v) => setAdmin({ ...admin, regime_trabalho: v })}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="Escolher" /></SelectTrigger>
                    <SelectContent>
                      {REGIMES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Salário</Label>
                  <Input className="h-10" value={admin.salario}
                    onChange={(e) => setAdmin({ ...admin, salario: e.target.value.replace(/[^\d.,]/g, "") })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Forma de pagamento</Label>
                  <Select value={admin.forma_pagamento} onValueChange={(v) => setAdmin({ ...admin, forma_pagamento: v })}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="Escolher" /></SelectTrigger>
                    <SelectContent>
                      {FORMAS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">Jornada prevista</Label>
                  <Input className="h-10" placeholder="Ex.: 44h semanais, 12x36, escala 6x1"
                    value={admin.jornada_descricao}
                    onChange={(e) => setAdmin({ ...admin, jornada_descricao: e.target.value })} />
                </div>
              </div>
              <Button
                className="mt-3"
                variant="outline"
                disabled={acoes.salvarAdmin.isPending}
                onClick={() => executar(() => acoes.salvarAdmin.mutateAsync({ ...admin }), "Informações salvas")}
              >
                Salvar Informações
              </Button>
            </section>

            <Separator />

            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Próximos Passos</h3>

              {["aguardando_revisao", "aguardando_nova_versao", "em_preenchimento"].includes(status) && (
                <div className="space-y-2">
                  <Label className="text-xs">Pedir correção ao candidato</Label>
                  <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2}
                    placeholder="Descreva o que precisa ser corrigido." />
                  <Button
                    variant="outline"
                    disabled={motivo.trim().length < 5 || acoes.solicitarCorrecao.isPending}
                    onClick={() =>
                      executar(() => acoes.solicitarCorrecao.mutateAsync(motivo.trim()), "Correção pedida ao candidato")}
                  >
                    Pedir Correção
                  </Button>
                </div>
              )}

              {["aguardando_revisao", "aguardando_nova_versao"].includes(status) && (
                <Button
                  disabled={acoes.prepararContabilidade.isPending}
                  onClick={() =>
                    executar(() => acoes.prepararContabilidade.mutateAsync(), "Ficha pronta para a contabilidade")}
                >
                  Preparar Para A Contabilidade
                </Button>
              )}

              {status === "pronto_contabilidade" && (
                <Button
                  onClick={() =>
                    executar(() => acoes.marcarStatus.mutateAsync("enviado_contabilidade"), "Envio registrado")}
                >
                  Marcar Como Enviada À Contabilidade
                </Button>
              )}

              {status === "enviado_contabilidade" && (
                <Button
                  variant="outline"
                  onClick={() =>
                    executar(
                      () => acoes.marcarStatus.mutateAsync("aguardando_retorno_contabilidade"),
                      "Aguardando o retorno da contabilidade",
                    )}
                >
                  Aguardando Retorno Da Contabilidade
                </Button>
              )}

              {["enviado_contabilidade", "aguardando_retorno_contabilidade"].includes(status) && (
                <div className="rounded-lg border p-3 space-y-2">
                  <p className="text-sm font-semibold">Ficha oficial devolvida pela contabilidade</p>
                  <p className="text-xs text-muted-foreground">
                    Primeiro anexe o arquivo recebido. Depois abra, confira e registre a conferência: são
                    dois atos distintos, e o cadastro só é criado após a conferência.
                  </p>
                  <input
                    ref={fichaRef}
                    type="file"
                    accept="application/pdf,image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) enviarFichaOficial(f);
                    }}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" disabled={enviandoFicha} onClick={() => fichaRef.current?.click()}>
                      {enviandoFicha ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileUp className="h-4 w-4 mr-2" />}
                      {fichaOficial ? "Anexar Nova Versão" : "Anexar Ficha Oficial"}
                    </Button>
                    {fichaOficial && (
                      <>
                        <Button variant="outline" onClick={() => ver(fichaOficial.id)}>
                          Abrir Ficha Oficial
                        </Button>
                        <Button
                          onClick={() =>
                            executar(
                              () => acoes.conferirFichaOficial.mutateAsync(fichaOficial.id),
                              "Conferência registrada",
                            )}
                        >
                          Registrar Conferência
                        </Button>
                      </>
                    )}
                  </div>
                  {!fichaOficial && (
                    <p className="text-xs text-muted-foreground">Nenhuma ficha oficial anexada ainda.</p>
                  )}
                </div>
              )}

              {status === "registro_recebido" && (
                <div className="rounded-lg border border-primary/40 p-3 space-y-2">
                  <p className="text-sm font-semibold">Concluir a admissão</p>
                  <p className="text-xs text-muted-foreground">
                    Confira os dados da ficha oficial na importação. Ao criar o cadastro, esta pré-admissão é concluída
                    na mesma operação, com os familiares e documentos já enviados.
                  </p>
                  <Button
                    onClick={() => navigate(`/dp/colaboradores/importar-ficha?preadmissao=${pa.id}`)}
                  >
                    Conferir Dados E Criar Cadastro
                  </Button>
                </div>
              )}

              {status === "concluido" && (
                <p className="text-sm text-emerald-600 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" /> Admissão concluída e cadastro criado.
                </p>
              )}
            </section>

            {!!data.eventos.length && (
              <section>
                <h3 className="text-sm font-semibold mb-2">Histórico</h3>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {data.eventos.map((e, i) => (
                    <li key={`${e.created_at}-${i}`}>
                      {new Date(e.created_at).toLocaleString("pt-BR")} — {e.evento.replace(/_/g, " ")}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
