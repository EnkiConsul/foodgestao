/**
 * Lista de Pré-Admissões reaproveitada em dois lugares: na tela própria de
 * Pré-Admissões e na aba "Pré-Admissão" da tela de Colaboradores.
 *
 * Nada aqui grava direto no banco — todas as ações passam pelas rotinas do
 * servidor, que reconferem empresa, permissão e a fase da ficha.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Ban, CalendarClock, Eye, Loader2, RefreshCw, Trash2, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { AdmissaoRegrasPanel } from "@/components/dp/preadmissao/AdmissaoRegrasPanel";
import { REGIMES_ADMISSAO } from "@/lib/dp/regimesAdmissao";
import {
  PreadmissaoConviteDialog, type ConviteInicial,
} from "@/components/dp/preadmissao/PreadmissaoConviteDialog";
import { PreadmissaoExcluirDialog } from "@/components/dp/preadmissao/PreadmissaoExcluirDialog";
import { PreadmissaoRevisaoDialog } from "@/components/dp/preadmissao/PreadmissaoRevisaoDialog";
import { notifyError } from "@/lib/notifyError";
import { useDpCargos, useDpUnidades } from "@/hooks/useDpCadastros";
import {
  PREADMISSAO_STATUS_LABEL, useDpPreadmissaoConvite, useDpPreadmissoes,
  type PreadmissaoStatus,
} from "@/hooks/dp/useDpPreadmissoes";
import { DpFilters, DpFilterField, type DpFilterChip } from "@/components/dp/DpFilters";
import { DpTableColumnsMenu } from "@/components/dp/DpTableColumnsMenu";
import { DpActionsMenu } from "@/components/dp/DpActions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { WhatsAppChoiceDrawer } from "@/components/dp/WhatsAppChoiceDrawer";
import { PreadmissaoMobileCard } from "./PreadmissaoMobileCard";

type ColunaKey = "candidato" | "situacao" | "cargo" | "validade";
const COLUNAS: { key: ColunaKey; label: string }[] = [
  { key: "candidato", label: "Candidato" },
  { key: "situacao", label: "Situação" },
  { key: "cargo", label: "Cargo / Unidade" },
  { key: "validade", label: "Link vale até" },
];
type GrupoKey = "todas" | "candidato" | "revisao" | "registro" | "efetivadas";
const GRUPOS: { key: GrupoKey; label: string }[] = [
  { key: "todas", label: "Todas" },
  { key: "candidato", label: "Aguardando Candidato" },
  { key: "revisao", label: "Prontas para Revisão" },
  { key: "registro", label: "Aguardando Registro" },
  { key: "efetivadas", label: "Efetivadas" },
];
export function grupoDoStatus(s: string): GrupoKey | null {
  if (["aguardando_preenchimento", "em_preenchimento", "correcao_solicitada", "aguardando_nova_versao"].includes(s)) return "candidato";
  if (s === "aguardando_revisao") return "revisao";
  if (["pronto_contabilidade", "enviado_contabilidade", "aguardando_retorno_contabilidade", "registro_recebido"].includes(s)) return "registro";
  if (s === "concluido") return "efetivadas";
  return null;
}
const COLUNAS_STORAGE = "dp.preadmissoes.colunas_ocultas";


const TOM: Partial<Record<PreadmissaoStatus, string>> = {
  aguardando_revisao: "bg-warning/10 text-warning-foreground border-warning/30",
  correcao_solicitada: "bg-warning/10 text-warning-foreground border-warning/30",
  registro_recebido: "bg-primary/10 text-primary border-primary/30",
  concluido: "bg-success/10 text-success-strong border-success/30",
  cancelado: "bg-muted text-muted-foreground",
  expirado: "bg-muted text-muted-foreground",
};

/**
 * Prorrogar só faz sentido enquanto a ficha está viva: depois de cancelada ou
 * já virada em cadastro de colaborador não há mais link para esticar.
 */
function podeProrrogar(status: PreadmissaoStatus, colaboradorId: string | null): boolean {
  return !colaboradorId && !["cancelado", "concluido"].includes(status);
}

interface Props {
  /** Abre o convite já na frente (chegada por "Enviar Link de Pré-Admissão"). */
  convidarAberto?: boolean;
  onConvidarChange?: (aberto: boolean) => void;
  /** Mostra o botão de convidar dentro do painel (a tela própria usa o cabeçalho). */
  mostrarBotaoConvidar?: boolean;
  /** Dados já conhecidos da pessoa (promoção de folguista). */
  conviteInicial?: ConviteInicial | null;
}

export function PreadmissoesPanel({
  convidarAberto, onConvidarChange, mostrarBotaoConvidar = false, conviteInicial = null,
}: Props) {
  const { data: lista = [], isLoading, isError, refetch } = useDpPreadmissoes();
  const { data: cargos = [] } = useDpCargos();
  const { data: unidades = [] } = useDpUnidades();
  const { reenviar, prorrogar, revogar } = useDpPreadmissaoConvite();
  const [busca, setBusca] = useState("");
  const [convidandoLocal, setConvidandoLocal] = useState(false);
  const convidando = convidarAberto ?? convidandoLocal;
  const setConvidando = (v: boolean) => (onConvidarChange ? onConvidarChange(v) : setConvidandoLocal(v));
  const [revisando, setRevisando] = useState<string | null>(null);
  // Ficha marcada para exclusão (confirmação em janela própria).
  const [excluindo, setExcluindo] = useState<{ id: string; nome: string } | null>(null);
  const [aba, setAba] = useState<"fichas" | "regras">("fichas");
  const [despacho, setDespacho] = useState<{ numero: string; mensagem: string } | null>(null);
  const [novoLink, setNovoLink] = useState<string | null>(null);

  const nomeCargo = (id: string | null) => cargos.find((c) => c.id === id)?.nome ?? "—";
  const nomeUnidade = (id: string | null) => unidades.find((u) => u.id === id)?.nome ?? "—";

  const [fSituacao, setFSituacao] = useState("todas");
  const [fUnidade, setFUnidade] = useState("todas");
  const [fCargo, setFCargo] = useState("todos");
  const [fRegime, setFRegime] = useState("todos");
  const [grupo, setGrupo] = useState<GrupoKey>("todas");
  const limparFiltros = () => {
    setFSituacao("todas"); setFUnidade("todas"); setFCargo("todos"); setFRegime("todos"); setGrupo("todas");
  };

  const [ocultas, setOcultas] = useState<ColunaKey[]>(() => {
    try { return JSON.parse(localStorage.getItem(COLUNAS_STORAGE) ?? "[]"); } catch { return []; }
  });
  const salvarOcultas = (v: ColunaKey[]) => {
    setOcultas(v);
    try { localStorage.setItem(COLUNAS_STORAGE, JSON.stringify(v)); } catch { /* sem armazenamento */ }
  };
  const alternarColuna = (k: ColunaKey) =>
    salvarOcultas(ocultas.includes(k) ? ocultas.filter((x) => x !== k) : [...ocultas, k]);
  const ver = (k: ColunaKey) => !ocultas.includes(k);

  const chips: DpFilterChip[] = [
    fSituacao !== "todas" && { key: "s", label: PREADMISSAO_STATUS_LABEL[fSituacao as PreadmissaoStatus], onRemove: () => setFSituacao("todas") },
    fUnidade !== "todas" && { key: "u", label: nomeUnidade(fUnidade), onRemove: () => setFUnidade("todas") },
    fCargo !== "todos" && { key: "c", label: nomeCargo(fCargo), onRemove: () => setFCargo("todos") },
    fRegime !== "todos" && { key: "r", label: REGIMES_ADMISSAO.find((r) => r.value === fRegime)?.label ?? fRegime, onRemove: () => setFRegime("todos") },
  ].filter(Boolean) as DpFilterChip[];

  const regimeDe = (p: unknown) => (p as { regime_previsto?: string | null }).regime_previsto ?? null;
  const contagem = useMemo(() => {
    const c: Record<GrupoKey, number> = { todas: lista.length, candidato: 0, revisao: 0, registro: 0, efetivadas: 0 };
    for (const p of lista) {
      const g = grupoDoStatus(p.status);
      if (g) c[g] += 1;
    }
    return c;
  }, [lista]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    const digitos = termo.replace(/\D/g, "");
    return lista.filter((p) => {
      if (grupo !== "todas" && grupoDoStatus(p.status) !== grupo) return false;
      if (fSituacao !== "todas" && p.status !== fSituacao) return false;
      if (fRegime !== "todos" && regimeDe(p) !== fRegime) return false;
      if (fUnidade !== "todas" && p.unidade_prevista_id !== fUnidade) return false;
      if (fCargo !== "todos" && p.cargo_previsto_id !== fCargo) return false;
      if (!termo) return true;
      return p.candidato_nome.toLocaleLowerCase("pt-BR").includes(termo)
        || (!!digitos && ((p.whatsapp ?? "").includes(digitos) || (p.cpf ?? "").includes(digitos)));
    });
  }, [lista, busca, fSituacao, fUnidade, fCargo, fRegime, grupo]);

  const gerarNovoLink = async (id: string) => {
    try {
      const r = await reenviar.mutateAsync({ preadmissao_id: id });
      setDespacho({ numero: lista.find((p) => p.id === id)?.whatsapp ?? "", mensagem: `Olá! Para começar sua admissão, preencha seus dados neste link: ${r.link}` });
      try { await navigator.clipboard.writeText(r.link); toast.success("Novo link gerado e copiado. O link anterior deixou de valer."); }
      catch { toast.info("Novo link gerado. Use Enviar ou Copiar mensagem na janela aberta."); }
    } catch (e) {
      notifyError(e as Error, { surface: "Pessoas 360°", action: "gerar um novo link" });
    }
  };

  /** Mantém o link que o candidato já recebeu e só estica o prazo dele. */
  const prorrogarValidade = async (id: string) => {
    try {
      const r = await prorrogar.mutateAsync({ preadmissao_id: id, dias_validade: 7 });
      const ate = new Date(r.expires_at).toLocaleDateString("pt-BR");
      toast.success(`Prazo prorrogado até ${ate}. O link que ele já recebeu voltou a abrir.`);
    } catch (e) {
      notifyError(e as Error, { surface: "Pessoas 360°", action: "prorrogar a validade do link" });
    }
  };

  const cancelar = async (id: string) => {
    if (!window.confirm("Cancelar o link deste candidato? Ele não conseguirá mais preencher.")) return;
    try {
      await revogar.mutateAsync(id);
      toast.success("Link cancelado");
    } catch (e) {
      notifyError(e as Error, { surface: "Pessoas 360°", action: "cancelar o link" });
    }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex gap-2">
        {([["fichas", "Fichas"], ["regras", "Regras"]] as const).map(([k, label]) => (
          <Button
            key={k}
            size="sm"
            variant={aba === k ? "default" : "outline"}
            onClick={() => setAba(k)}
          >
            {label}
          </Button>
        ))}
        </div>
        <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => refetch()} disabled={isLoading} aria-label="Atualizar pré-admissões" title="Atualizar pré-admissões"><RefreshCw className="h-4 w-4" /></Button>
      </div>

      {aba === "regras" ? <AdmissaoRegrasPanel /> : (
      <section className="min-w-0 space-y-3">
          {mostrarBotaoConvidar && (
            <div className="flex justify-end">
              <Button onClick={() => setConvidando(true)}>
                <UserPlus className="h-4 w-4 mr-2" /> Convidar Candidato
              </Button>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2 md:hidden" aria-label="Etapas da pré-admissão">
            {([ ["candidato", "Candidato"], ["revisao", "Revisão"], ["registro", "Registro"] ] as const).map(([key, label]) => (
              <Button key={key} variant={grupo === key ? "default" : "outline"} aria-pressed={grupo === key}
                className="h-auto min-h-16 min-w-0 flex-col gap-1 px-1 py-2" onClick={() => { setGrupo(grupo === key ? "todas" : key); setFSituacao("todas"); }}>
                <span className="text-xl font-semibold tabular-nums">{isLoading ? "—" : contagem[key]}</span><span className="text-xs">{label}</span>
              </Button>
            ))}
          </div>
          <div className="md:hidden">
            <Select value={grupo} onValueChange={(v) => { setGrupo(v as GrupoKey); setFSituacao("todas"); }}>
              <SelectTrigger className="min-h-11" aria-label="Exibir etapa"><SelectValue /></SelectTrigger>
              <SelectContent>{GRUPOS.map((g) => <SelectItem key={g.key} value={g.key}>{g.label} ({contagem[g.key]})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="hidden md:flex flex-wrap gap-2" role="tablist" aria-label="Situação das fichas">
            {GRUPOS.map((g) => (
              <Button
                key={g.key}
                size="sm"
                role="tab"
                aria-selected={grupo === g.key}
                variant={grupo === g.key ? "default" : "outline"}
                className="shrink-0"
                onClick={() => { setGrupo(g.key); setFSituacao("todas"); }}
              >
                {g.label}
                <span className="ml-1.5 rounded-full bg-background/20 px-1.5 text-xs tabular-nums">{contagem[g.key]}</span>
              </Button>
            ))}
          </div>
          <DpFilters
            search={{ value: busca, onChange: setBusca, placeholder: "Nome, CPF ou WhatsApp" }}
            chips={chips}
            onClear={limparFiltros}
          >
            <DpFilterField label="Situação">
              <Select value={fSituacao} onValueChange={(v) => { setFSituacao(v); setGrupo("todas"); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  {(Object.keys(PREADMISSAO_STATUS_LABEL) as PreadmissaoStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>{PREADMISSAO_STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </DpFilterField>
            <DpFilterField label="Unidade">
              <Select value={fUnidade} onValueChange={setFUnidade}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  {unidades.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </DpFilterField>
            <DpFilterField label="Cargo">
              <Select value={fCargo} onValueChange={setFCargo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {cargos.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </DpFilterField>
            <DpFilterField label="Vínculo">
              <Select value={fRegime} onValueChange={setFRegime}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {REGIMES_ADMISSAO.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </DpFilterField>
          </DpFilters>

          {isError ? <div className="py-8 text-center space-y-3"><p className="text-sm text-muted-foreground">Não foi possível carregar as fichas. Tente novamente.</p><Button variant="outline" onClick={() => refetch()}>Tentar novamente</Button></div> : isLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Carregando…
            </div>
          ) : !filtradas.length ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {lista.length ? "Nenhuma ficha corresponde aos filtros selecionados." : "Nenhuma pré-admissão por aqui. Convide um candidato para começar."}
              {lista.length > 0 && <Button variant="link" onClick={() => { limparFiltros(); setBusca(""); }}>Limpar filtros</Button>}
            </div>
          ) : (
            <>
              {/* Celular */}
              <div className="space-y-2 md:hidden">
                {filtradas.map((p) => <PreadmissaoMobileCard key={p.id} ficha={p} cargo={nomeCargo(p.cargo_previsto_id)} unidade={nomeUnidade(p.unidade_prevista_id)}
                  prorrogando={prorrogar.isPending} onRevisar={() => setRevisando(p.id)} onProrrogar={() => prorrogarValidade(p.id)}
                  onNovoLink={() => setNovoLink(p.id)} onCancelar={() => cancelar(p.id)} onExcluir={() => setExcluindo({ id: p.id, nome: p.candidato_nome })}
                  onMensagem={() => setDespacho({ numero: p.whatsapp, mensagem: `Olá, ${p.candidato_nome}! Tudo bem? Podemos acompanhar sua pré-admissão? Se precisar de ajuda com a ficha ou os documentos, me avise.` })} />)}
              </div>

              {/* Telas maiores: largura fixa e texto quebrando — nunca rolagem lateral */}
              <div className="hidden md:block">
                <div className="mb-2 flex justify-end">
                  <DpTableColumnsMenu
                    columns={COLUNAS}
                    hidden={ocultas}
                    essentialKeys={["candidato"]}
                    onToggle={alternarColuna}
                    onReset={() => salvarOcultas([])}
                  />
                </div>
                <Table className="table-fixed w-full">
                  <TableHeader>
                    <TableRow>
                      {ver("candidato") && <TableHead className="w-[30%]">Candidato</TableHead>}
                      {ver("situacao") && <TableHead className="w-[18%]">Situação</TableHead>}
                      {ver("cargo") && <TableHead>Cargo / Unidade</TableHead>}
                      {ver("validade") && <TableHead className="w-[14%]">Link vale até</TableHead>}
                      <TableHead className="w-[104px] text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtradas.map((p) => (
                      <TableRow key={p.id} className="cursor-pointer" onClick={() => setRevisando(p.id)}>
                        {ver("candidato") && (
                          <TableCell className="break-words">
                            <span className="font-medium">{p.candidato_nome}</span>
                            <span className="block text-xs text-muted-foreground">{p.whatsapp}</span>
                          </TableCell>
                        )}
                        {ver("situacao") && (
                          <TableCell>
                            <Badge variant="outline" className={`${TOM[p.status] ?? ""} whitespace-normal`}>
                              {PREADMISSAO_STATUS_LABEL[p.status]}
                            </Badge>
                            {(() => {
                              const rotina = rotinaDaPreadmissao(p.admin_dados);
                              if (!rotina) return null;
                              const dias = diasAguardandoRegistro(rotina.iniciou_em);
                              return (
                                <Badge
                                  variant="outline"
                                  className="ml-1 whitespace-normal border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-500"
                                  title="Já atua na rotina da loja com vínculo provisório de freelancer, aguardando o registro oficial."
                                >
                                  Na rotina · aguardando registro há {dias} {dias === 1 ? "dia" : "dias"}
                                </Badge>
                              );
                            })()}
                          </TableCell>
                        )}
                        {ver("cargo") && (
                          <TableCell className="break-words text-sm text-muted-foreground">
                            {nomeCargo(p.cargo_previsto_id)} · {nomeUnidade(p.unidade_prevista_id)}{p.regime_previsto ? ` · ${REGIMES_ADMISSAO.find((r) => r.value === p.regime_previsto)?.label ?? p.regime_previsto}` : ""}
                          </TableCell>
                        )}
                        {ver("validade") && (
                          <TableCell className="text-sm text-muted-foreground">
                            {p.convite_expira_em ? new Date(p.convite_expira_em).toLocaleDateString("pt-BR") : "—"}
                          </TableCell>
                        )}
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Revisar"
                              aria-label={`Revisar a ficha de ${p.candidato_nome}`}
                              onClick={() => setRevisando(p.id)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <DpActionsMenu
                              vertical
                              className="min-h-9 min-w-9"
                              actions={[
                                {
                                  key: "prorrogar", label: "Prorrogar Validade", icon: CalendarClock,
                                  hidden: !podeProrrogar(p.status, p.colaborador_id),
                                  disabled: prorrogar.isPending, onSelect: () => prorrogarValidade(p.id),
                                },
                                { key: "link", label: "Gerar Novo Link", icon: RefreshCw, hidden: !podeProrrogar(p.status, p.colaborador_id), onSelect: () => setNovoLink(p.id) },
                                {
                                  key: "cancelar", label: "Cancelar Link", icon: Ban, destructive: true,
                                  separatorBefore: true, onSelect: () => cancelar(p.id),
                                },
                                {
                                  key: "excluir", label: "Excluir Ficha", icon: Trash2, destructive: true,
                                  disabled: p.status === "concluido" || !!p.colaborador_id,
                                  onSelect: () => setExcluindo({ id: p.id, nome: p.candidato_nome }),
                                },
                              ]}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
      </section>
      )}

      <ResponsiveDialog open={!!novoLink} onOpenChange={(v) => { if (!v) setNovoLink(null); }} title="Gerar novo link?" description="O link anterior deixará de funcionar. O novo link será copiado para você enviar ao candidato."
        footer={<><Button variant="outline" onClick={() => setNovoLink(null)}>Cancelar</Button><Button disabled={reenviar.isPending} onClick={async () => { if (!novoLink) return; await gerarNovoLink(novoLink); setNovoLink(null); }}>Gerar e copiar</Button></>}><p className="text-sm text-muted-foreground">Para manter o link atual, use Prorrogar Validade.</p></ResponsiveDialog>
      {despacho && <WhatsAppChoiceDrawer key={`${despacho.numero}:${despacho.mensagem}`} open onOpenChange={(v) => { if (!v) setDespacho(null); }} {...despacho} />}

      <PreadmissaoConviteDialog
        open={convidando}
        onOpenChange={setConvidando}
        inicial={conviteInicial}
      />
      <PreadmissaoRevisaoDialog
        preadmissaoId={revisando}
        onOpenChange={() => setRevisando(null)}
      />
      <PreadmissaoExcluirDialog
        preadmissaoId={excluindo?.id ?? null}
        candidatoNome={excluindo?.nome ?? ""}
        onOpenChange={(v) => { if (!v) setExcluindo(null); }}
      />
    </>
  );
}
