import { useMemo, useState } from "react";
import { AlertTriangle, Check, FileText, Loader2, Plus, UserCheck, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { matchCargo } from "@/lib/dp/ficha-registro/cargo-match";
import { matchTurno, type TurnoCadastrado } from "@/lib/dp/ficha-registro/turno-match";
import { CONFIANCA_LABEL, nivelDoCampo, type NivelConfianca } from "@/lib/dp/ficha-registro/confianca";
import { CargoCorrespondenciaDialog } from "./CargoCorrespondenciaDialog";
import { FichaComparacaoDialog } from "./FichaComparacaoDialog";
import {
  jornadaDaFicha, useAplicarFicha, useIgnorarFicha, type FichaItem,
} from "@/hooks/useDpFichaImportacao";


const DOW_LABEL = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const NIVEL_CLASS: Record<NivelConfianca, string> = {
  alta: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
  media: "border-amber-500/40 text-amber-600 dark:text-amber-400",
  baixa: "border-destructive/40 text-destructive",
  ausente: "border-muted text-muted-foreground",
};

interface Props {
  item: FichaItem;
  cargos: Array<{ id: string; nome: string; cbo?: string | null }>;
  unidades: Array<{ id: string; nome: string }>;
  turnos?: TurnoCadastrado[];
  unidadePadraoId: string | null;
}

export function FichaRevisaoCard({ item, cargos, unidades, turnos = [], unidadePadraoId }: Props) {
  const extraidos = (item.dados_extraidos ?? {}) as Record<string, unknown>;
  const confianca = (item.confianca_campos ?? {}) as Record<string, string>;

  const [dados, setDados] = useState<Record<string, unknown>>(() => ({ ...extraidos }));
  const cargoSugerido = useMemo(
    () => matchCargo({ cargo_nome: (dados.cargo_nome as string) ?? null, cbo: (dados.cbo as string) ?? null }, cargos),
    [dados.cargo_nome, dados.cbo, cargos],
  );
  const [cargoId, setCargoId] = useState<string | null>(cargoSugerido.cargo_id);
  const [unidadeId, setUnidadeId] = useState<string | null>(unidadePadraoId ?? unidades[0]?.id ?? null);
  const [usarJornada, setUsarJornada] = useState(true);
  const [atualizar, setAtualizar] = useState(!!item.colaborador_existente_id);
  const [anexarFicha, setAnexarFicha] = useState(true);
  const [verTexto, setVerTexto] = useState(false);
  const [cargoDialog, setCargoDialog] = useState(false);
  const [comparacao, setComparacao] = useState(false);

  const jornada = useMemo(() => jornadaDaFicha(dados), [dados]);
  const turnoSugerido = useMemo(() => matchTurno(jornada, turnos, unidadeId), [jornada, turnos, unidadeId]);
  const [turnoId, setTurnoId] = useState<string | null>(null);
  const turnoEscolhido = turnoId ?? turnoSugerido.turno_id;
  const aplicar = useAplicarFicha();
  const ignorar = useIgnorarFicha();

  const aplicado = item.status === "criado" || item.status === "atualizado";
  const ignorado = item.status === "ignorado";

  const executar = (camposPermitidos: string[] | null) =>
    aplicar.mutate(
      {
        item,
        dados,
        cargoId,
        unidadeId,
        atualizarExistente: atualizar && !!item.colaborador_existente_id,
        jornada: usarJornada ? jornada : null,
        turnoId: usarJornada ? turnoEscolhido : null,
        camposPermitidos,
        anexarFicha,
      },
      {
        onSuccess: () => {
          setComparacao(false);
          toast.success(atualizar ? "Cadastro atualizado" : "Colaborador cadastrado");
        },
        onError: (e: Error) => toast.error(e.message),
      },
    );



  const set = (campo: string, valor: string) => setDados((d) => ({ ...d, [campo]: valor }));

  const campo = (label: string, nome: string, tipo: "text" | "date" = "text") => {
    const valor = dados[nome];
    const nivel = nivelDoCampo(valor, confianca, nome);
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs">{label}</Label>
          <Badge variant="outline" className={cn("h-4 px-1 text-[10px] font-normal", NIVEL_CLASS[nivel])}>
            {CONFIANCA_LABEL[nivel]}
          </Badge>
        </div>
        <Input
          className="h-9"
          type={tipo}
          value={typeof valor === "string" || typeof valor === "number" ? String(valor) : ""}
          onChange={(e) => set(nome, e.target.value)}
          disabled={aplicado || ignorado}
        />
      </div>
    );
  };

  if (ignorado) {
    return (
      <Card className="opacity-60">
        <CardContent className="flex items-center justify-between gap-3 p-4">
          <span className="text-sm">{item.nome_extraido ?? "Ficha sem nome"}</span>
          <Badge variant="outline">Ignorada</Badge>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn(aplicado && "border-emerald-500/40")}>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-semibold">{(dados.nome as string) ?? "Ficha sem nome"}</p>
            <p className="text-xs text-muted-foreground">
              Página {item.pagina_inicio}
              {item.pagina_fim > item.pagina_inicio ? ` a ${item.pagina_fim}` : ""}
            </p>
          </div>
          {aplicado ? (
            <Badge className="bg-emerald-600 text-white">
              <Check className="mr-1 h-3 w-3" />
              {item.status === "criado" ? "Cadastro criado" : "Cadastro atualizado"}
            </Badge>
          ) : item.colaborador_existente_id ? (
            <Badge variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400">
              <UserCheck className="mr-1 h-3 w-3" /> Já cadastrado
            </Badge>
          ) : item.status === "revisar" ? (
            <Badge variant="outline" className="border-destructive/50 text-destructive">
              <AlertTriangle className="mr-1 h-3 w-3" /> Precisa de revisão
            </Badge>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {campo("Nome", "nome")}
          {campo("CPF", "cpf")}
          {campo("Matrícula", "matricula")}
          {campo("Nascimento", "data_nascimento", "date")}
          {campo("Admissão", "data_admissao", "date")}
          {campo("Salário", "salario")}
          {campo("Telefone", "telefone")}
          {campo("Nome da mãe", "nome_mae")}
          {campo("RG", "rg_numero")}
          {campo("CTPS", "ctps_numero")}
          {campo("PIS", "pis_nit")}
          {campo("Cargo na ficha", "cargo_nome")}
        </div>

        {!aplicado && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Cargo cadastrado</Label>
              <Select value={cargoId ?? "__none"} onValueChange={(v) => setCargoId(v === "__none" ? null : v)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Escolher" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Sem cargo</SelectItem>
                  {cargos.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {cargoSugerido.cargo_id && cargoSugerido.cargo_id === cargoId && (
                <p className="text-[11px] text-muted-foreground">Sugerido pela ficha ({cargoSugerido.motivo === "cbo" ? "pelo código CBO" : "pelo nome"}).</p>
              )}
              {!cargoSugerido.cargo_id && !!dados.cargo_nome && (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    Nenhum cargo parecido com “{String(dados.cargo_nome)}”.
                  </p>
                  <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => setCargoDialog(true)}>
                    <Plus className="mr-1 h-3 w-3" /> Criar este cargo
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Unidade</Label>
              <Select value={unidadeId ?? "__none"} onValueChange={(v) => setUnidadeId(v === "__none" ? null : v)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Escolher" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Sem unidade</SelectItem>
                  {unidades.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {!jornada.vazia && (
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Horário da ficha</p>
              {!aplicado && (
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Cadastrar</Label>
                  <Switch checked={usarJornada} onCheckedChange={setUsarJornada} />
                </div>
              )}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1 text-xs sm:grid-cols-4 lg:grid-cols-7">
              {jornada.dias.map((d) => (
                <div key={d.dow} className="rounded border bg-background px-2 py-1">
                  <span className="font-medium">{DOW_LABEL[d.dow]}</span>
                  <span className="ml-1 text-muted-foreground">
                    {d.trabalha && d.entrada && d.saida ? `${d.entrada}–${d.saida}` : "folga"}
                  </span>
                </div>
              ))}
            </div>
            {jornada.vira_meia_noite && (
              <p className="mt-2 text-[11px] text-muted-foreground">A saída acontece no dia seguinte.</p>
            )}
          </div>
        )}

        {item.colaborador_existente_id && !aplicado && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
            <Switch checked={atualizar} onCheckedChange={setAtualizar} />
            <span className="text-xs">
              Este CPF já tem cadastro. Ative para completar o cadastro existente com os dados da ficha.
            </span>
          </div>
        )}

        {!aplicado && (
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={ignorar.isPending}
              onClick={() => ignorar.mutate(item, { onError: (e: Error) => toast.error(e.message) })}
            >
              <X className="mr-1 h-4 w-4" /> Ignorar
            </Button>
            <Button
              size="sm"
              disabled={aplicar.isPending || (!!item.colaborador_existente_id && !atualizar)}
              onClick={() =>
                aplicar.mutate(
                  {
                    item,
                    dados,
                    cargoId,
                    unidadeId,
                    atualizarExistente: atualizar && !!item.colaborador_existente_id,
                    jornada: usarJornada ? jornada : null,
                  },
                  {
                    onSuccess: () => toast.success(atualizar ? "Cadastro atualizado" : "Colaborador cadastrado"),
                    onError: (e: Error) => toast.error(e.message),
                  },
                )
              }
            >
              {aplicar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
              {atualizar && item.colaborador_existente_id ? "Atualizar cadastro" : "Criar cadastro"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
