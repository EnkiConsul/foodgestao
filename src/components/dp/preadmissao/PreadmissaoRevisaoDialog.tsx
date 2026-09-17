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
import { useDpCargos, useDpUnidades } from "@/hooks/useDpCadastros";
import { useDpSetores } from "@/hooks/useDpSetores";
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

/** Formas de pagamento canônicas do DP (mesmos valores do cadastro). */
const FORMAS = [
  { value: "mensalista", label: "Mensalista" },
  { value: "horista", label: "Horista" },
  { value: "diarista", label: "Diarista" },
  { value: "semanal", label: "Semanal" },
  { value: "por_turno", label: "Por turno" },
  { value: "servico_acordo", label: "Por serviço / acordo" },
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
  const { data: cargos = [] } = useDpCargos();
  const { data: unidades = [] } = useDpUnidades();
  const { ativos: setores } = useDpSetores(admin.unidade_id || null);
  const fichaRef = useRef<HTMLInputElement>(null);
  const [enviandoFicha, setEnviandoFicha] = useState(false);

  const pa = data?.preadmissao;
  const status = (pa?.status ?? "aguardando_preenchimento") as PreadmissaoStatus;
  const dados = (pa?.dados ?? {}) as Record<string, unknown>;

  useEffect(() => {
    const a = (pa?.admin_dados ?? {}) as Record<string, unknown>;
    const txt = (v: unknown) => (v === null || v === undefined ? "" : String(v));
    const bool = (v: unknown) => (v === true ? "sim" : v === false ? "nao" : "");
    setAdmin({
      data_admissao: txt(a.data_admissao),
      regime_trabalho: txt(a.regime_trabalho),
      salario: txt(a.salario),
      forma_pagamento: txt(a.forma_pagamento),
      jornada_descricao: txt(a.jornada_descricao),
      carga_horaria_semanal: txt(a.carga_horaria_semanal),
      experiencia_dias: txt(a.experiencia_dias),
      cargo_id: txt(a.cargo_id) || (pa?.cargo_previsto_id ?? ""),
      unidade_id: txt(a.unidade_id) || (pa?.unidade_prevista_id ?? ""),
      setor_id: txt(a.setor_id),
      vale_transporte: bool(a.vale_transporte),
      adicional_insalubridade: bool(a.adicional_insalubridade),
      adicional_periculosidade: bool(a.adicional_periculosidade),
      observacoes: txt(a.observacoes),
    });
  }, [pa?.id, pa?.admin_dados, pa?.cargo_previsto_id, pa?.unidade_prevista_id]);

  /** Converte a tela em payload aceito pelo servidor (números e Sim/Não). */
  const adminParaEnvio = () => {
    const out: Record<string, unknown> = {};
    const trio = ["vale_transporte", "adicional_insalubridade", "adicional_periculosidade"];
    for (const [k, v] of Object.entries(admin)) {
      if (trio.includes(k)) {
        if (v === "sim") out[k] = true;
        else if (v === "nao") out[k] = false;
        continue;
      }
      out[k] = v;
    }
    return out;
  };

  const fichaOficial = useMemo(
    () =>
      (data?.documentos ?? []).find((d) => d.requisito_codigo === "ficha_oficial" && !d.substituido_em) ?? null,
    [data?.documentos],
  );

  /** Monta uma folha imprimível com tudo que a contabilidade precisa conferir. */
  const imprimirPacote = () => {
    if (!data) return;
    const esc = (v: unknown) =>
      String(v ?? "").replace(/[<>&]/g, (m) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[m] as string));
    const linhas = (obj: Record<string, unknown>) =>
      Object.entries(obj)
        .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
        .map(([k, v]) => `<tr><th>${esc(k.replace(/_/g, " "))}</th><td>${esc(v)}</td></tr>`)
        .join("");
    const pessoas = (data.pessoas ?? [])
      .map((pe) => `<li>${esc(pe.nome)} — ${esc(pe.parentesco)}${pe.data_nascimento ? ` — ${esc(pe.data_nascimento)}` : ""}</li>`)
      .join("");
    const docs = (data.documentos ?? [])
      .filter((d) => !d.substituido_em)
      .map((d) => `<li>${esc(d.requisito_codigo)} — ${esc(d.file_name)} (${esc(d.status)})</li>`)
      .join("");
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Pacote da contabilidade — ${esc(data.preadmissao.candidato_nome)}</title>
<style>body{font-family:system-ui,sans-serif;padding:24px;color:#111}h1{font-size:18px}h2{font-size:14px;margin-top:20px}
table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #ddd;padding:4px 6px;text-align:left}
th{width:220px;background:#f6f6f6;text-transform:capitalize}ul{font-size:12px}</style></head><body>
<h1>Pacote da contabilidade — ${esc(data.preadmissao.candidato_nome)}</h1>
<h2>Dados do candidato</h2><table>${linhas((data.preadmissao.dados ?? {}) as Record<string, unknown>)}</table>
<h2>Informações administrativas</h2><table>${linhas((data.preadmissao.admin_dados ?? {}) as Record<string, unknown>)}</table>
<h2>Familiares</h2><ul>${pessoas || "<li>Nenhum</li>"}</ul>
<h2>Documentos recebidos</h2><ul>${docs || "<li>Nenhum</li>"}</ul>
</body></html>`;
    const w = window.open("", "_blank", "noopener,width=900,height=700");
    if (!w) {
      toast.error("Libere as janelas pop-up para imprimir o pacote.");
      return;
    }
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  };

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

  const enviarFichaOficial = async (arquivo: File) => {
    setEnviandoFicha(true);
    try {
      await anexarFichaOficial(preadmissaoId!, arquivo);
      toast.success("Ficha oficial anexada. Confira o arquivo e registre a conferência.");
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
            {data.cpf_existente && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
                <p className="font-semibold text-amber-700">CPF já cadastrado nesta empresa</p>
                <p className="text-muted-foreground">
                  {data.cpf_existente.situacao === "ativo"
                    ? `${data.cpf_existente.nome} está com cadastro ativo. Confira antes de seguir: não é possível admitir o mesmo CPF duas vezes.`
                    : `${data.cpf_existente.nome} já trabalhou aqui. A conclusão será registrada como recontratação.`}
                </p>
              </div>
            )}

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

            {/* Previsão do convite: muda o que o candidato precisa enviar. */}
            <section>
              <h3 className="text-sm font-semibold mb-2">Vaga Prevista</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor="pa-cargo-previsto">Cargo previsto</Label>
                  <Select
                    value={pa.cargo_previsto_id ?? ""}
                    disabled={encerrada || acoes.alterarPrevisto.isPending}
                    onValueChange={(v) =>
                      executar(() => acoes.alterarPrevisto.mutateAsync({ cargo_previsto_id: v }), "Cargo previsto alterado")}
                  >
                    <SelectTrigger id="pa-cargo-previsto" className="h-10"><SelectValue placeholder="Escolher" /></SelectTrigger>
                    <SelectContent>
                      {cargos.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor="pa-unidade-prevista">Unidade prevista</Label>
                  <Select
                    value={pa.unidade_prevista_id ?? ""}
                    disabled={encerrada || acoes.alterarPrevisto.isPending}
                    onValueChange={(v) =>
                      executar(() => acoes.alterarPrevisto.mutateAsync({ unidade_prevista_id: v }), "Unidade prevista alterada")}
                  >
                    <SelectTrigger id="pa-unidade-prevista" className="h-10"><SelectValue placeholder="Escolher" /></SelectTrigger>
                    <SelectContent>
                      {unidades.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor="pa-22h">Trabalha após as 22h</Label>
                  <Select
                    value={pa.trabalho_apos_22h ? "sim" : "nao"}
                    disabled={encerrada || acoes.alterarPrevisto.isPending}
                    onValueChange={(v) =>
                      executar(
                        () => acoes.alterarPrevisto.mutateAsync({ trabalho_apos_22h: v === "sim" }),
                        "Informação de horário alterada",
                      )}
                  >
                    <SelectTrigger id="pa-22h" className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nao">Não</SelectItem>
                      <SelectItem value="sim">Sim</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Mudar a vaga recalcula os documentos exigidos. Nada que o candidato já enviou é apagado.
              </p>
            </section>

            <Separator />

            <section>
              <h3 className="text-sm font-semibold mb-2">Informações Da Empresa (Para A Contabilidade)</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor="pa-adm-data">Data de admissão</Label>
                  <Input id="pa-adm-data" type="date" className="h-10" value={admin.data_admissao}
                    disabled={encerrada}
                    onChange={(e) => setAdmin({ ...admin, data_admissao: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor="pa-adm-vinculo">Vínculo</Label>
                  <Select value={admin.regime_trabalho} disabled={encerrada}
                    onValueChange={(v) => setAdmin({ ...admin, regime_trabalho: v })}>
                    <SelectTrigger id="pa-adm-vinculo" className="h-10"><SelectValue placeholder="Escolher" /></SelectTrigger>
                    <SelectContent>
                      {REGIMES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor="pa-adm-cargo">Cargo</Label>
                  <Select value={admin.cargo_id} disabled={encerrada}
                    onValueChange={(v) => setAdmin({ ...admin, cargo_id: v })}>
                    <SelectTrigger id="pa-adm-cargo" className="h-10"><SelectValue placeholder="Escolher" /></SelectTrigger>
                    <SelectContent>
                      {cargos.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor="pa-adm-unidade">Unidade</Label>
                  <Select value={admin.unidade_id} disabled={encerrada}
                    onValueChange={(v) => setAdmin({ ...admin, unidade_id: v, setor_id: "" })}>
                    <SelectTrigger id="pa-adm-unidade" className="h-10"><SelectValue placeholder="Escolher" /></SelectTrigger>
                    <SelectContent>
                      {unidades.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor="pa-adm-setor">Setor</Label>
                  <Select value={admin.setor_id} disabled={encerrada || !admin.unidade_id}
                    onValueChange={(v) => setAdmin({ ...admin, setor_id: v })}>
                    <SelectTrigger id="pa-adm-setor" className="h-10">
                      <SelectValue placeholder={admin.unidade_id ? "Escolher" : "Escolha a unidade"} />
                    </SelectTrigger>
                    <SelectContent>
                      {setores.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor="pa-adm-salario">Salário</Label>
                  <Input id="pa-adm-salario" className="h-10" value={admin.salario} inputMode="decimal"
                    disabled={encerrada}
                    onChange={(e) => setAdmin({ ...admin, salario: e.target.value.replace(/[^\d.,]/g, "") })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor="pa-adm-forma">Forma de pagamento</Label>
                  <Select value={admin.forma_pagamento} disabled={encerrada}
                    onValueChange={(v) => setAdmin({ ...admin, forma_pagamento: v })}>
                    <SelectTrigger id="pa-adm-forma" className="h-10"><SelectValue placeholder="Escolher" /></SelectTrigger>
                    <SelectContent>
                      {FORMAS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor="pa-adm-carga">Carga semanal (horas)</Label>
                  <Input id="pa-adm-carga" className="h-10" inputMode="numeric" value={admin.carga_horaria_semanal}
                    disabled={encerrada} placeholder="Ex.: 44"
                    onChange={(e) => setAdmin({ ...admin, carga_horaria_semanal: e.target.value.replace(/[^\d]/g, "") })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor="pa-adm-exp">Experiência (dias)</Label>
                  <Input id="pa-adm-exp" className="h-10" inputMode="numeric" value={admin.experiencia_dias}
                    disabled={encerrada} placeholder="Ex.: 45"
                    onChange={(e) => setAdmin({ ...admin, experiencia_dias: e.target.value.replace(/[^\d]/g, "") })} />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs" htmlFor="pa-adm-jornada">Jornada prevista</Label>
                  <Input id="pa-adm-jornada" className="h-10" placeholder="Ex.: 44h semanais, 12x36, escala 6x1"
                    value={admin.jornada_descricao} disabled={encerrada}
                    onChange={(e) => setAdmin({ ...admin, jornada_descricao: e.target.value })} />
                </div>
                {[
                  ["vale_transporte", "Vale-transporte"],
                  ["adicional_insalubridade", "Adicional de insalubridade"],
                  ["adicional_periculosidade", "Adicional de periculosidade"],
                ].map(([campo, rotulo]) => (
                  <div key={campo} className="space-y-1">
                    <Label className="text-xs" htmlFor={`pa-adm-${campo}`}>{rotulo}</Label>
                    <Select value={admin[campo] ?? ""} disabled={encerrada}
                      onValueChange={(v) => setAdmin({ ...admin, [campo]: v })}>
                      <SelectTrigger id={`pa-adm-${campo}`} className="h-10"><SelectValue placeholder="Escolher" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nao">Não</SelectItem>
                        <SelectItem value="sim">Sim</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs" htmlFor="pa-adm-obs">Observações para a contabilidade</Label>
                  <Textarea id="pa-adm-obs" rows={2} value={admin.observacoes} disabled={encerrada}
                    onChange={(e) => setAdmin({ ...admin, observacoes: e.target.value })} />
                </div>
              </div>
              <Button
                className="mt-3"
                variant="outline"
                disabled={encerrada || acoes.salvarAdmin.isPending}
                onClick={() => executar(() => acoes.salvarAdmin.mutateAsync(adminParaEnvio()), "Informações salvas")}
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

              {status === "aguardando_revisao" && (
                <Button
                  disabled={acoes.prepararContabilidade.isPending}
                  onClick={() =>
                    executar(() => acoes.prepararContabilidade.mutateAsync(), "Ficha pronta para a contabilidade")}
                >
                  Preparar Para A Contabilidade
                </Button>
              )}

              {["pronto_contabilidade", "enviado_contabilidade", "aguardando_retorno_contabilidade"].includes(status) && (
                <Button variant="outline" onClick={imprimirPacote}>
                  <FileUp className="h-4 w-4 mr-2" />
                  Imprimir Pacote Da Contabilidade
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
