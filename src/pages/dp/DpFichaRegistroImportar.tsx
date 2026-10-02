import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, FileText, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmarAcaoDialog } from "@/components/dp/ConfirmarAcaoDialog";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { FichaRevisaoCard } from "@/components/dp/ficha-registro/FichaRevisaoCard";
import { FichaHistoricoPainel } from "@/components/dp/ficha-registro/FichaHistoricoPainel";
import { ColaboradorFormDialog } from "@/components/dp/ColaboradorFormDialog";
import { useDpCargos, useDpUnidades } from "@/hooks/useDpCadastros";
import { useDpSetores } from "@/hooks/useDpSetores";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import { useDpTurnos } from "@/hooks/useDpTurnos";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import {
  useDpFichaImportacoes, useDpFichaItens, useEnviarFichaPdf,
  useCancelarLeituraFicha, useTentarNovamenteFicha, MOTIVO_CANCELADA,
} from "@/hooks/useDpFichaImportacao";
import { notifyError } from "@/lib/notifyError";
import { divergenciaLote } from "@/lib/dp/ficha-registro/lote-empresa";
import { leituraTravada } from "@/lib/dp/ficha-registro/leituraTravada";
import { digitsCnpj, formatCnpj } from "@/lib/dp/ficha-registro/unidade-match";
import { cn } from "@/lib/utils";

/** Situação de cada envio, em linguagem de tela. */
const STATUS_ENVIO: Record<string, string> = {
  pending: "na fila",
  processing: "em leitura",
  ready: "lido",
  failed: "não foi possível ler",
};

/** Vínculos do cadastro (enum dp_regime_trabalho) — igual ao card de conferência. */
const REGIMES: Array<{ value: string; label: string }> = [
  { value: "clt", label: "CLT efetivo" },
  { value: "intermitente", label: "CLT intermitente" },
  { value: "estagio", label: "Estagiário" },
  { value: "temporario", label: "Temporário" },
  { value: "pj", label: "PJ / Sócio" },
  { value: "mei", label: "MEI" },
  { value: "freelancer", label: "Freelancer (sem registro)" },
];


export default function DpFichaRegistroImportar() {
  const { selectedCompanyId, companies, setContext } = useCompanyContext();
  /** Quando a conferência é a da ficha oficial de uma Pré-Admissão. */
  const [params] = useSearchParams();
  const preadmissaoId = params.get("preadmissao");
  /** Promoção de folguista / pessoa em teste por ficha de registro. */
  const pessoaApoioId = params.get("apoio");
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [importacaoId, setImportacaoId] = useState<string | null>(null);

  const { data: importacoes = [] } = useDpFichaImportacoes();
  const enviar = useEnviarFichaPdf();
  const cancelar = useCancelarLeituraFicha();
  const repetir = useTentarNovamenteFicha();

  const atual = useMemo(
    () => importacoes.find((i) => i.id === importacaoId) ?? importacoes[0] ?? null,
    [importacoes, importacaoId],
  );
  const processando = atual?.status === "processing";
  const aguardandoFichas = atual?.status === "ready" && (atual?.fichas_identificadas ?? 0) > 0;
  const { data: itens = [] } = useDpFichaItens(atual?.id, processando, aguardandoFichas);

  const { data: cargos = [] } = useDpCargos();
  const { data: unidades = [] } = useDpUnidades();
  const { turnos = [] } = useDpTurnos();
  const unidadesDaEmpresa = useMemo(
    () => unidades
      .filter((u) => u.company_id === selectedCompanyId)
      .map((u) => ({
        id: u.id,
        nome: u.nome,
        cnpj: (u as { cnpj?: string | null }).cnpj ?? null,
        possui_relogio_ponto: (u as { possui_relogio_ponto?: boolean | null }).possui_relogio_ponto ?? false,
      })),
    [unidades, selectedCompanyId],
  );
  const { data: empresaCnpj = null } = useQuery({
    queryKey: ["company_cnpj", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies").select("cnpj").eq("id", selectedCompanyId!).maybeSingle();
      if (error) throw error;
      return (data?.cnpj as string | null) ?? null;
    },
  });
  const { setores: setoresEmpresa } = useDpSetores();
  const setoresAtivos = useMemo(
    () => setoresEmpresa
      .filter((s) => s.ativo !== false)
      .map((s) => ({ id: s.id, nome: s.nome, unidade_id: s.unidade_id })),
    [setoresEmpresa],
  );

  // Setor e vínculo aplicados a todas as fichas (cargo, unidade e horário seguem ficha por ficha).
  const [setorPadraoId, setSetorPadraoId] = useState<string | null>(null);
  const [regimePadrao, setRegimePadrao] = useState<string | null>(null);

  const { data: colaboradores = [] } = useDpColaboradores();
  const [cadastroAbertoId, setCadastroAbertoId] = useState<string | null>(null);
  const colaboradorAberto = useMemo(
    () => colaboradores.find((c) => c.id === cadastroAbertoId) ?? null,
    [colaboradores, cadastroAbertoId],
  );

  useEffect(() => {
    if (!importacaoId && importacoes[0]) setImportacaoId(importacoes[0].id);
  }, [importacoes, importacaoId]);

  const pendentes = itens.filter((i) => ["pendente", "revisar", "duplicado"].includes(i.status));
  const prontos = itens.filter((i) => ["criado", "atualizado"].includes(i.status));

  /** Relógio de tela: usado só para perceber leitura que parou de responder. */
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    if (!processando) return;
    const t = window.setInterval(() => setAgora(Date.now()), 10000);
    return () => window.clearInterval(t);
  }, [processando]);
  const travada = !!atual && leituraTravada(atual, agora);

  /** O arquivo é de outro CNPJ? Avisamos antes de conferir ficha por ficha. */
  const divergencia = useMemo(
    () => divergenciaLote(itens, unidadesDaEmpresa, empresaCnpj),
    [itens, unidadesDaEmpresa, empresaCnpj],
  );
  const empresaAtual = companies.find((c) => c.id === selectedCompanyId) ?? null;
  const empresaDoArquivo = useMemo(() => {
    const alvo = divergencia.cnpjs[0];
    if (!alvo) return null;
    return companies.find((c) => digitsCnpj(c.cnpj) === alvo) ?? null;
  }, [companies, divergencia.cnpjs]);
  const [conferirMesmoAssim, setConferirMesmoAssim] = useState(false);
  const bloqueadoPorEmpresa = divergencia.divergente && !conferirMesmoAssim;




  /** Abre o PDF original de um envio anterior por link temporário. */
  const abrirArquivo = async (path: string) => {
    const { data, error } = await supabase.storage.from("dp-bulk-import").createSignedUrl(path, 60);
    if (error || !data) {
      toast.error("Não foi possível abrir o arquivo");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const enviarArquivo = () => {
    if (!file) return;
    enviar.mutate(file, {
      onSuccess: ({ importacaoId: id }) => {
        setImportacaoId(id);
        setFile(null);
        if (inputRef.current) inputRef.current.value = "";
        toast.success("Ficha enviada — estamos lendo os dados");
      },
      onError: (e: Error) =>
        notifyError(e, {
          surface: "Importar ficha de registro",
          action: "importar a ficha de registro",
          fallback: e?.message && !/row-level|violates|pg_|relation "/i.test(e.message) ? e.message : undefined,
        }),
    });
  };

  return (
    <DpPage>
      <DpPageHeader
        icon={FileText}
        title="Importar ficha de registro"
        description="Envie a ficha de registro em PDF e confira os dados antes de gerar o cadastro."
        actions={
          <Button variant="outline" size="sm" className="h-10 rounded-full" asChild>
            <Link to="/dp/colaboradores">
              <ArrowLeft className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Colaboradores</span>
            </Link>
          </Button>
        }
      />

      {preadmissaoId && (
        <Card className="border-primary/40">
          <CardContent className="py-4 text-sm">
            <p className="font-semibold">Conferência da ficha oficial de uma pré-admissão</p>
            <p className="text-muted-foreground">
              Envie a ficha que a contabilidade devolveu e confira os dados. Ao criar o cadastro, a pré-admissão é
              concluída na mesma operação, com os familiares e os documentos que o candidato já enviou.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Enviar ficha em PDF</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Pode ser a ficha de uma pessoa ou um arquivo com as fichas de toda a equipe — separamos uma a uma.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              className="h-10"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={enviar.isPending}
            />
            <Button className="h-10" onClick={enviarArquivo} disabled={!file || enviar.isPending}>
              {enviar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Enviar e ler
            </Button>
          </div>
        </CardContent>
      </Card>

      {importacoes.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Fichas enviadas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 p-4 pt-0">
            <p className="pb-2 text-sm text-muted-foreground">
              Toque em um envio para rever as fichas dele e abrir o arquivo original.
            </p>
            {importacoes.map((imp) => (
              <div
                key={imp.id}
                className={cn(
                  "flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm",
                  imp.id === atual?.id ? "border-primary bg-primary/5" : "border-border",
                )}
              >
                <button
                  type="button"
                  onClick={() => setImportacaoId(imp.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate font-medium">{imp.arquivo_nome}</span>
                  <span className="block text-xs text-muted-foreground">
                    {new Date(imp.created_at).toLocaleString("pt-BR", {
                      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
                    })}
                    {" · "}
                    {imp.fichas_identificadas ?? 0} ficha(s)
                    {" · "}
                    {STATUS_ENVIO[imp.status] ?? imp.status}
                  </span>
                </button>
                {imp.arquivo_path ? (
                  <Button variant="outline" size="sm" className="h-8" onClick={() => abrirArquivo(imp.arquivo_path!)}>
                    Abrir PDF
                  </Button>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {atual && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate text-sm font-medium">{atual.arquivo_nome}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {Math.max(itens.length, atual.fichas_identificadas ?? 0)} ficha(s)
                </Badge>
                {prontos.length > 0 && <Badge className="bg-emerald-600 text-white">{prontos.length} no cadastro</Badge>}
              </div>
            </div>

            {processando && (
              <div className="space-y-1">
                <Progress
                  value={atual.total_paginas ? (atual.paginas_processadas / atual.total_paginas) * 100 : 8}
                />
                {travada ? (
                  <p className="text-xs text-destructive">
                    A leitura parou de responder na página {atual.paginas_processadas} de{" "}
                    {atual.total_paginas || "…"}. Tente novamente — não é preciso reenviar o PDF.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Lendo página {atual.paginas_processadas} de {atual.total_paginas || "…"}
                    {" · "}
                    {atual.fichas_identificadas ?? 0} ficha(s) encontrada(s) até aqui — pode deixar a tela aberta.
                  </p>
                )}
                <div className="flex flex-wrap justify-end gap-2">
                  {travada && (
                    <Button
                      size="sm"
                      className="h-8"
                      disabled={repetir.isPending}
                      onClick={() =>
                        repetir.mutate(atual, {
                          onSuccess: () => toast.success("Leitura reiniciada."),
                          onError: (e) => toast.error((e as Error).message),
                        })
                      }
                    >
                      {repetir.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                      Tentar novamente
                    </Button>
                  )}
                  <ConfirmarAcaoDialog
                    titulo="Cancelar a leitura?"
                    descricao="A leitura deste arquivo será interrompida. Depois você pode tentar novamente sem reenviar o PDF."
                    confirmar="Cancelar leitura"
                    onConfirm={() =>
                      cancelar.mutate(atual.id, {
                        onSuccess: () => toast.success("Leitura cancelada."),
                        onError: (e) => toast.error((e as Error).message),
                      })
                    }
                    disabled={cancelar.isPending}
                  >
                    <Button variant="outline" size="sm" className="h-8" disabled={cancelar.isPending}>
                      Cancelar leitura
                    </Button>
                  </ConfirmarAcaoDialog>
                </div>
              </div>
            )}

            {atual.status === "failed" && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className={cn("text-sm", atual.erro_mensagem === MOTIVO_CANCELADA ? "text-muted-foreground" : "text-destructive")}>
                  {atual.erro_mensagem === MOTIVO_CANCELADA
                    ? MOTIVO_CANCELADA
                    : `Não conseguimos ler este arquivo${atual.erro_mensagem ? `: ${atual.erro_mensagem}` : "."}`}
                </p>
                <Button
                  size="sm"
                  className="h-8"
                  disabled={repetir.isPending}
                  onClick={() =>
                    repetir.mutate(atual, {
                      onSuccess: () => toast.success("Leitura reiniciada."),
                      onError: (e) => toast.error((e as Error).message),
                    })
                  }
                >
                  {repetir.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  Tentar novamente
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {divergencia.divergente && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="space-y-3 p-4">
            <p className="text-sm font-semibold text-destructive">
              Este arquivo é de outro CNPJ
            </p>
            <p className="text-sm text-muted-foreground">
              As fichas trazem o CNPJ {divergencia.cnpjs.map((c) => formatCnpj(c)).join(", ")}
              {divergencia.empregadores.length > 0 ? ` (${divergencia.empregadores.join(", ")})` : ""}, mas você está
              trabalhando na empresa {empresaAtual ? (empresaAtual.trade_name || empresaAtual.name) : "selecionada"}
              {empresaAtual?.cnpj ? ` — ${formatCnpj(empresaAtual.cnpj)}` : ""}. Troque de empresa antes de conferir,
              para os cadastros não nascerem no lugar errado.
            </p>
            <div className="flex flex-wrap gap-2">
              {empresaDoArquivo && (
                <Button
                  size="sm"
                  className="h-9"
                  onClick={() => {
                    setContext("pj", empresaDoArquivo.id);
                    setImportacaoId(null);
                    setConferirMesmoAssim(false);
                    toast.success(
                      `Empresa alterada para ${empresaDoArquivo.trade_name || empresaDoArquivo.name}. Envie o PDF novamente aqui.`,
                    );
                  }}
                >
                  Trocar para {empresaDoArquivo.trade_name || empresaDoArquivo.name}
                </Button>
              )}
              {processando && (
                <ConfirmarAcaoDialog
                  titulo="Cancelar a leitura?"
                  descricao="A leitura deste arquivo será interrompida e nenhuma ficha será cadastrada."
                  confirmar="Cancelar leitura"
                  onConfirm={() =>
                    cancelar.mutate(atual!.id, {
                      onSuccess: () => toast.success("Leitura cancelada."),
                      onError: (e) => toast.error((e as Error).message),
                    })
                  }
                  disabled={cancelar.isPending}
                >
                  <Button variant="outline" size="sm" className="h-9" disabled={cancelar.isPending}>
                    Cancelar leitura
                  </Button>
                </ConfirmarAcaoDialog>
              )}
              {bloqueadoPorEmpresa && (
                <Button variant="ghost" size="sm" className="h-9" onClick={() => setConferirMesmoAssim(true)}>
                  Conferir mesmo assim
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {itens.length > 0 && pendentes.length === 0 && (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Todas as Fichas Foram Cadastradas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              As {itens.length} fichas deste lote já viraram colaboradores. Próximos passos sugeridos:
            </p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Confira a lista de colaboradores e complete o que ficou marcado como incompleto.</li>
              <li>Revise os cargos e salários de cada função.</li>
              <li>Envie novas fichas, se ainda houver pessoas para cadastrar.</li>
            </ol>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild><Link to="/dp/colaboradores">Ver Colaboradores</Link></Button>
              <Button asChild variant="outline"><Link to="/dp/cadastros/cargos">Revisar Cargos</Link></Button>
              <Button variant="ghost" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
                Enviar Novas Fichas
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {pendentes.length > 0 && !bloqueadoPorEmpresa && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Conferir e cadastrar ({pendentes.length})</h2>


          <Card className="bg-muted/20">
            <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <p className="text-sm font-medium">Aplicar a todas as fichas</p>
                <p className="text-xs text-muted-foreground">
                  Vale para as fichas em que você não escolher outro valor. Cargo, unidade e horário continuam ficha por ficha.
                </p>
              </div>
              {setoresAtivos.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs">Setor</Label>
                  <Select
                    value={setorPadraoId ?? "__none"}
                    onValueChange={(v) => setSetorPadraoId(v === "__none" ? null : v)}
                  >
                    <SelectTrigger className="h-9"><SelectValue placeholder="Escolher" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Não aplicar</SelectItem>
                      {setoresAtivos.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">Vínculo</Label>
                <Select
                  value={regimePadrao ?? "__none"}
                  onValueChange={(v) => setRegimePadrao(v === "__none" ? null : v)}
                >
                  <SelectTrigger className="h-9"><SelectValue placeholder="Escolher" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Não aplicar</SelectItem>
                    {REGIMES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {pendentes.map((item, idx) => (
            <div key={item.id} id={`ficha-item-${item.id}`} className="scroll-mt-20">
            <FichaRevisaoCard
              posicao={itens.findIndex((i) => i.id === item.id) + 1}
              total={itens.length}
              emFoco={idx === 0}
              onConcluido={(itemId, nome) => {
                const proximo = pendentes.find((p) => p.id !== itemId);
                if (proximo) {
                  const pos = itens.findIndex((i) => i.id === proximo.id) + 1;
                  const nomeProx = String((proximo.dados_extraidos as Record<string, unknown> | null)?.nome ?? proximo.nome_extraido ?? "Ficha sem nome");
                  toast.info(`${nome} concluído. Próximo: ${nomeProx} (Ficha ${pos} de ${itens.length})`, { duration: 6000 });
                  setTimeout(() => {
                    document.getElementById(`ficha-item-${proximo.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }, 400);
                } else {
                  toast.success("Todas as fichas deste lote foram conferidas.");
                }
              }}
              item={item}
              cargos={cargos.map((c) => ({ id: c.id, nome: c.nome, cbo: c.cbo }))}
              turnos={turnos}
              unidades={unidadesDaEmpresa}
              setores={setoresAtivos}
              unidadePadraoId={unidadesDaEmpresa[0]?.id ?? null}
              empresaCnpj={empresaCnpj}
              setorPadraoId={setorPadraoId}
              regimePadrao={regimePadrao}
              onAbrirCadastro={setCadastroAbertoId}
              preadmissaoId={preadmissaoId}
              pessoaApoioId={pessoaApoioId}
            />
            </div>
          ))}
        </div>
      )}

      {atual?.status === "ready" && !preadmissaoId && (
        <FichaHistoricoPainel importacaoId={atual.id} itens={itens} />
      )}

      {prontos.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Já no cadastro ({prontos.length})</h2>
          {prontos.map((item) => (
            <FichaRevisaoCard
              key={item.id}
              item={item}
              cargos={cargos.map((c) => ({ id: c.id, nome: c.nome, cbo: c.cbo }))}
              turnos={turnos}
              unidades={unidadesDaEmpresa}
              setores={setoresAtivos}
              unidadePadraoId={null}
              empresaCnpj={empresaCnpj}
              onAbrirCadastro={setCadastroAbertoId}
              preadmissaoId={preadmissaoId}
              pessoaApoioId={pessoaApoioId}
            />
          ))}
        </div>
      )}

      {colaboradorAberto && (
        <ColaboradorFormDialog
          open={!!colaboradorAberto}
          onOpenChange={(o) => !o && setCadastroAbertoId(null)}
          colaborador={colaboradorAberto}
        />
      )}

      {atual && !processando && itens.length === 0 && atual.status !== "failed" && (
        aguardandoFichas ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando as fichas lidas…
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhuma ficha foi reconhecida neste arquivo. Confira se o PDF é a ficha de registro de empregado.
          </p>
        )
      )}

    </DpPage>
  );
}
