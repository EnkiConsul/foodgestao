import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { toast } from "sonner";
import {
  Scale,
  Store,
  Trash2,
  Pencil,
  Plus,
  Settings2,
  CalendarClock,
  AlertCircle,
} from "lucide-react";
import { DpPage, DpPageHeader, DpContentCard, useDpEmbedded } from "@/components/dp/DpPage";
import { DpErrorState } from "@/components/dp/DpErrorState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FolgaRegrasFormDialog } from "@/components/dp/folgas/FolgaRegrasFormDialog";
import { useDpConfigDp, type DpConfigDpForm } from "@/hooks/useDpConfigDp";
import { useDpUnidades } from "@/hooks/useDpCadastros";
import { useDpFolgaLimites } from "@/hooks/useDpFolgaLimites";
import {
  DP_CONFIG_DP_DEFAULT,
  DIA_SEMANA_CURTO,
  diasElegiveisDaConfig,
  padraoLegalDomingo,
  semanasDaConfig,
} from "@/lib/dp/dsr-rules";

const STORAGE_KEY = "dp:regras-folgas:unidade";

type DialogState =
  | { open: false }
  | { open: true; modo: "criar"; unidadeId: null; copiarDe: string | null }
  | { open: true; modo: "editar"; unidadeId: string; copiarDe: null };

function resumoBase(regra: DpConfigDpForm): string {
  if (regra.regra_dsr === "clt") return "Base legal (CLT)";
  if (regra.tipo_descanso_domingo === "acordo_coletivo") return "Acordo/convenção coletiva";
  return "Política própria da empresa";
}

function resumoDiasDescanso(regra: DpConfigDpForm): string {
  const dias = diasElegiveisDaConfig(regra);
  if (dias.length === 0) return "Nenhum dia de descanso definido";
  return dias
    .sort((a, b) => a - b)
    .map((d) => DIA_SEMANA_CURTO[d])
    .join(", ");
}

function resumoFrequencia(regra: DpConfigDpForm): string {
  const semanas = semanasDaConfig(regra);
  const padrao = padraoLegalDomingo(regra.setor_comercio);
  const geral =
    regra.modo_frequencia_domingo === "semanas"
      ? `${regra.periodicidade_domingo} em ${regra.periodicidade_domingo} semana(s)`
      : `${regra.domingos_por_mes} por mês`;
  const mulher =
    regra.modo_frequencia_domingo_mulher === "semanas"
      ? `${regra.periodicidade_domingo_mulher} em ${regra.periodicidade_domingo_mulher} semana(s)`
      : `${regra.domingos_por_mes_mulher} por mês`;
  const ok = semanas.geral >= padrao && semanas.mulher >= 2;
  return `${geral} (geral) / ${mulher} (mulheres)${ok ? "" : " — abaixo do padrão legal"}`;
}

function resumoJanela(regra: DpConfigDpForm): string {
  if (!regra.folga_janela_ativa) return "Período mensal desligado";
  return `Escolha das folgas: dia ${regra.folga_janela_abre_dia} a ${regra.folga_janela_fecha_dia}${
    regra.folga_autoatribuir ? "; quem não escolher recebe folga automaticamente" : ""
  }`;
}

function UnitCard({
  unidade,
  regra,
  contagemParticularidades,
  onEdit,
  onLimpar,
}: {
  unidade: { id: string; nome: string };
  regra: DpConfigDpForm;
  contagemParticularidades: number;
  onEdit: () => void;
  onLimpar: () => void;
}) {
  const configurada = regra !== DP_CONFIG_DP_DEFAULT;
  const dias = diasElegiveisDaConfig(regra);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Store className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <h3 className="truncate text-base font-semibold">{unidade.nome}</h3>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {configurada ? "Regras configuradas para esta unidade" : "Segue o padrão legal (CLT)"}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Editar
          </Button>
          {configurada && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onLimpar} title="Limpar regras">
              <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pb-4 pt-0">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="text-xs">
            {resumoBase(regra)}
          </Badge>
          {contagemParticularidades > 0 && (
            <Badge variant="outline" className="text-xs">
              {contagemParticularidades} particularidade{contagemParticularidades > 1 ? "s" : ""}
            </Badge>
          )}
          {regra.folga_janela_ativa && (
            <Badge variant="outline" className="gap-1 text-xs">
              <CalendarClock className="h-3 w-3" aria-hidden="true" />
              Janela mensal
            </Badge>
          )}
        </div>

        <dl className="grid gap-2 text-xs">
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Dias de descanso</dt>
            <dd className="text-right font-medium">{resumoDiasDescanso(regra)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Frequência</dt>
            <dd className="text-right font-medium">{resumoFrequencia(regra)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Período de escolha</dt>
            <dd className="text-right font-medium">{resumoJanela(regra)}</dd>
          </div>
          {dias.length === 0 && (
            <div className="flex items-start gap-1.5 rounded-md bg-destructive/10 p-2 text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Nenhum dia de descanso negociado. O colaborador não conseguirá marcar folga.</span>
            </div>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}

export default function DpConfiguracoesJornada() {
  const embedded = useDpEmbedded();
  const {
    configPadrao,
    rows,
    isLoading,
    isError,
    refetch,
    removerExcecao,
    removendo,
  } = useDpConfigDp(null);
  const { data: todasUnidades = [], isLoading: unidadesCarregando, isError: unidadesErro } = useDpUnidades();
  const { contagem: contagemParticularidades } = useDpFolgaLimites(null);

  const [dialog, setDialog] = useState<DialogState>({ open: false });
  const [limparAberto, setLimparAberto] = useState<string | null>(null);

  const unidades = useMemo(() => todasUnidades, [todasUnidades]);

  const regraDaUnidade = (unidadeId: string): DpConfigDpForm => {
    const row = rows.find((r) => r.unidade_id === unidadeId);
    if (!row) return configPadrao;
    const { id: _id, unidade_id: _unidade, ...regras } = row;
    return regras;
  };

  const handleLimpar = async () => {
    if (!limparAberto) return;
    try {
      await removerExcecao(limparAberto);
      setLimparAberto(null);
      toast.success("Regras da unidade removidas.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível remover as regras");
    }
  };

  if (isError) {
    return (
      <DpPage>
        <DpPageHeader title="Regras De Folgas" icon={Scale} />
        <DpErrorState onRetry={refetch} />
      </DpPage>
    );
  }

  return (
    <DpPage>
      {!embedded && (
        <Helmet>
          <title>Regras De Folgas | Pessoas 360°</title>
          <meta
            name="description"
            content="Configure a periodicidade de folga dominical, o descanso por acordo coletivo e as regras de folgas do Departamento Pessoal, por unidade de loja."
          />
        </Helmet>
      )}

      <DpPageHeader
        title="Regras De Folgas"
        description="Parâmetros de DSR e folga dominical — configurados por unidade de loja."
        icon={Scale}
        actions={
          <Button
            onClick={() => setDialog({ open: true, modo: "criar", unidadeId: null, copiarDe: null })}
            className="gap-2"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nova regra
          </Button>
        }
      />

      <DpContentCard contentClassName="space-y-5 p-4 md:p-5">
        <div>
          <h2 className="text-base font-semibold">Unidades</h2>
          <p className="text-xs text-muted-foreground">
            Cada unidade tem suas próprias regras de folga. Unidades sem regra própria seguem o padrão
            legal (CLT).
          </p>
        </div>

        {unidadesErro && (
          <div className="flex items-center gap-2 text-xs text-destructive">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            <span>Não foi possível carregar as unidades.</span>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Tentar novamente
            </Button>
          </div>
        )}

        {isLoading || unidadesCarregando ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="h-48 animate-pulse bg-muted" />
            ))}
          </div>
        ) : unidades.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center">
            <Settings2 className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-2 text-sm font-medium">Nenhuma unidade cadastrada</p>
            <p className="text-xs text-muted-foreground">
              Cadastre ao menos uma unidade em Cadastros → Unidades para definir as regras de folgas.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {unidades.map((u) => (
              <UnitCard
                key={u.id}
                unidade={u}
                regra={regraDaUnidade(u.id)}
                contagemParticularidades={contagemParticularidades[u.id] ?? 0}
                onEdit={() => setDialog({ open: true, modo: "editar", unidadeId: u.id, copiarDe: null })}
                onLimpar={() => setLimparAberto(u.id)}
              />
            ))}
          </div>
        )}
      </DpContentCard>

      <FolgaRegrasFormDialog
        open={dialog.open}
        onOpenChange={(open) => {
          if (!open) setDialog({ open: false });
        }}
        modo={dialog.open ? dialog.modo : "criar"}
        unidadeId={dialog.open && dialog.modo === "editar" ? dialog.unidadeId : null}
        configInicial={
          dialog.open && dialog.modo === "editar" && dialog.unidadeId
            ? regraDaUnidade(dialog.unidadeId)
            : configPadrao
        }
        unidades={unidades}
        copiarDe={dialog.open && dialog.modo === "criar" ? dialog.copiarDe : null}
        onSuccess={() => {
          void refetch();
        }}
      />

      <AlertDialog open={!!limparAberto} onOpenChange={(v) => !v && setLimparAberto(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar Regras Desta Unidade?</AlertDialogTitle>
            <AlertDialogDescription>
              As regras de {unidades.find((u) => u.id === limparAberto)?.nome ?? "esta unidade"} serão
              apagadas e a unidade voltará a seguir o padrão legal (CLT) até ser configurada novamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removendo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleLimpar();
              }}
              disabled={removendo}
            >
              {removendo ? "Removendo..." : "Limpar Regras"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DpPage>
  );
}

