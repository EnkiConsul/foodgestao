import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import {
  competenciaEfeito,
  rotuloCompetencia,
  situacaoAtual,
  type AdiantamentoSolicitacao,
  type AdiantamentoTipoSolicitacao,
} from "@/lib/dp/adiantamento-opcao";
import { emitirTermoAdiantamentoGestor, gerarTermoAdiantamentoPdf } from "@/lib/dp/adiantamento-termo";
import { buscarConfidencial } from "@/lib/dp/confidencial";
import { abrirNoApp } from "@/lib/visualizadorGlobal";
import { registrarAdiantamento } from "@/lib/dp/solicitacoes-admin";
import { notifyError } from "@/lib/notifyError";

type ModoTermo = "portal" | "impresso" | "papel_existente";

function hojeISO() {
  return format(new Date(), "yyyy-MM-dd");
}

function labelData(iso: string) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

const MODO_TERMO: { value: ModoTermo; titulo: string; ajuda: string }[] = [
  { value: "portal", titulo: "Enviar para assinar no portal", ajuda: "O termo vai para Meus Documentos do colaborador." },
  { value: "impresso", titulo: "Gerar via impressa", ajuda: "Imprima, colha a assinatura e anexe a via assinada na ficha." },
  { value: "papel_existente", titulo: "Já tenho o termo assinado em papel", ajuda: "Fica registrado que o termo físico está com a empresa." },
];

/**
 * Histórico de adiantamento salarial por solicitações datadas (ativar/suspender).
 * Registro do gestor: sem antecedência e aceita data retroativa. A ativação
 * acompanha o Termo de Opção (portal, via impressa ou papel já assinado).
 */
export function AdiantamentoSolicitacoesPanel({
  companyId,
  colaboradorId,
  diaPagamento,
  fallbackOptante,
}: {
  companyId: string;
  colaboradorId: string;
  diaPagamento: number | null | undefined;
  /** Mantido por compatibilidade: este painel é sempre do gestor. */
  origem?: "gestor";
  fallbackOptante?: boolean | null;
}) {
  const qc = useQueryClient();
  const [tipo, setTipo] = useState<AdiantamentoTipoSolicitacao>("ativar");
  const [data, setData] = useState(hojeISO());
  const [modoTermo, setModoTermo] = useState<ModoTermo>("portal");

  const query = useQuery({
    queryKey: ["dp_adiantamento_solicitacoes", companyId, colaboradorId],
    enabled: !!companyId && !!colaboradorId,
    queryFn: async (): Promise<AdiantamentoSolicitacao[]> => {
      const { data: rows, error } = await supabase
        .from("dp_adiantamento_solicitacoes")
        .select("id, colaborador_id, tipo, data_solicitacao, competencia_efeito, origem, observacao, created_at, termo_modo, termo_documento_id")
        .eq("company_id", companyId)
        .eq("colaborador_id", colaboradorId)
        .order("data_solicitacao", { ascending: false });
      if (error) throw error;
      return (rows ?? []) as unknown as AdiantamentoSolicitacao[];
    },
  });

  const solicitacoes = query.data ?? [];
  const ativo = useMemo(
    () => situacaoAtual(solicitacoes, hojeISO(), fallbackOptante, diaPagamento),
    [solicitacoes, fallbackOptante, diaPagamento],
  );

  const emitirTermo = async (manual: boolean) => {
    const [colab, empresa, conf] = await Promise.all([
      supabase.from("dp_colaboradores").select("nome, cargo, dp_cargos(nome), dp_unidades(nome, adiantamento_antecedencia_dias)").eq("id", colaboradorId).maybeSingle(),
      supabase.from("companies").select("name, cnpj").eq("id", companyId).maybeSingle(),
      buscarConfidencial(companyId, [colaboradorId]).catch(() => new Map()),
    ]);
    const c = colab.data as { nome: string; cargo: string | null; dp_cargos: { nome: string } | null; dp_unidades: { nome: string; adiantamento_antecedencia_dias: number } | null } | null;
    if (!c) throw new Error("Colaborador não encontrado.");
    const cc = conf.get(colaboradorId);
    const bytes = await gerarTermoAdiantamentoPdf(
      {
        empresa: empresa.data?.name ?? "Empresa",
        cnpj: empresa.data?.cnpj ?? null,
        unidade: c.dp_unidades?.nome ?? null,
        nome: c.nome,
        cpf: cc?.liberado ? String(cc.cpf ?? "") : null,
        cargo: c.dp_cargos?.nome ?? c.cargo,
      },
      {
        dia: diaPagamento ?? 15,
        antecedencia: c.dp_unidades?.adiantamento_antecedencia_dias ?? 5,
        competencia: competenciaEfeito(data, diaPagamento, "gestor"),
      },
      manual,
    );
    const id = await emitirTermoAdiantamentoGestor({ companyId, colaboradorId, bytes, manual });
    if (manual) {
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      abrirNoApp({ titulo: "Termo de Opção pelo Adiantamento Salarial", url, mime: "application/pdf", nome: "termo-opcao-adiantamento.pdf" });
    }
    return id;
  };

  const registrar = useMutation({
    mutationFn: async () => {
      if (!data) throw new Error("Informe a data da solicitação.");
      let termo: { modo: "documento" | "papel_existente"; id?: string } | null = null;
      if (tipo === "ativar") {
        termo = modoTermo === "papel_existente"
          ? { modo: "papel_existente" }
          : { modo: "documento", id: await emitirTermo(modoTermo === "impresso") };
      }
      return await registrarAdiantamento({
        colaboradorId, tipo, data,
        termoModo: termo?.modo ?? null,
        termoDocumentoId: termo?.id ?? null,
      });
    },
    onSuccess: (resultado) => {
      qc.invalidateQueries({ queryKey: ["dp_adiantamento_solicitacoes"] });
      qc.invalidateQueries({ queryKey: ["dp_adiantamento_relacao"] });
      qc.invalidateQueries({ queryKey: ["dp_pendencias"] });
      qc.invalidateQueries({ queryKey: ["dp_doc_consistencia_janela"] });
      qc.invalidateQueries({ queryKey: ["dp_colaborador_documentos"] });
      qc.invalidateQueries({ queryKey: ["dp_documentos"] });
      const competencia = resultado?.competencia_efeito;
      const desc = tipo === "ativar"
        ? modoTermo === "portal" ? "O termo foi enviado para assinatura no portal." : modoTermo === "impresso" ? "Imprima o termo, colha a assinatura e anexe a via assinada na ficha." : undefined
        : undefined;
      toast.success(
        `${tipo === "ativar" ? "Adiantamento ativado" : "Adiantamento suspenso"}${competencia ? ` a partir de ${rotuloCompetencia(competencia)}` : ""}`,
        desc ? { description: desc } : undefined,
      );
    },
    onError: (e: any) => notifyError(e, { surface: "Adiantamento", action: "concluir a ação", fallback: "Não foi possível registrar a solicitação." }),
  });

  return (
    <div className="space-y-3 rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Label className="text-sm">Adiantamento salarial</Label>
        <Badge variant={ativo ? "default" : "secondary"}>{ativo ? "Ativo" : "Sem adiantamento"}</Badge>
        <span className="ml-auto text-xs text-muted-foreground">
          {diaPagamento ? `Pagamento no dia ${diaPagamento}` : "Dia de pagamento não configurado"}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_1fr] sm:items-end">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Solicitação</Label>
          <Select value={tipo} onValueChange={(v) => setTipo(v as AdiantamentoTipoSolicitacao)}>
            <SelectTrigger className="min-h-11 sm:h-9 sm:min-h-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ativar">Ativar adiantamento</SelectItem>
              <SelectItem value="cancelar">Suspender adiantamento</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`adiant-data-${colaboradorId}`} className="text-xs text-muted-foreground">Data da solicitação</Label>
          <Input
            id={`adiant-data-${colaboradorId}`}
            type="date"
            className="min-h-11 sm:h-9 sm:min-h-0"
            value={data}
            onChange={(e) => setData(e.target.value)}
          />
        </div>
      </div>

      {tipo === "ativar" && (
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-muted-foreground">Termo de opção</legend>
          <RadioGroup value={modoTermo} onValueChange={(v) => setModoTermo(v as ModoTermo)} className="gap-2">
            {MODO_TERMO.map((m) => (
              <label key={m.value} htmlFor={`adiant-termo-${m.value}-${colaboradorId}`} className="flex cursor-pointer items-start gap-3 rounded-md border p-2.5">
                <RadioGroupItem id={`adiant-termo-${m.value}-${colaboradorId}`} value={m.value} className="mt-0.5" />
                <span className="text-sm">
                  <span className="font-medium">{m.titulo}</span>
                  <span className="block text-xs text-muted-foreground">{m.ajuda}</span>
                </span>
              </label>
            ))}
          </RadioGroup>
        </fieldset>
      )}

      <p className="text-xs text-muted-foreground">
        {data ? `Vale a partir de ${rotuloCompetencia(competenciaEfeito(data, diaPagamento, "gestor"))}.` : "Escolha a data da solicitação."}{" "}
        {tipo === "ativar"
          ? "Continua nos meses seguintes até um pedido de suspensão. O gestor registra sem antecedência e pode completar datas passadas."
          : "O gestor registra sem antecedência e pode completar datas passadas."}
      </p>

      <Button
        type="button"
        className="min-h-11 w-full sm:h-9 sm:min-h-0 sm:w-auto"
        disabled={registrar.isPending || !data}
        onClick={() => registrar.mutate()}
      >
        {registrar.isPending ? "Salvando…" : tipo === "ativar" ? "Registrar ativação" : "Registrar suspensão"}
      </Button>

      <div className="space-y-1">
        {query.isLoading && <p className="text-xs text-muted-foreground">Carregando histórico…</p>}
        {!query.isLoading && solicitacoes.length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhuma solicitação registrada.</p>
        )}
        {solicitacoes.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
            <Badge variant="outline" className="text-[11px]">
              {s.tipo === "ativar" ? "Ativou" : "Suspendeu"}
            </Badge>
            <span>{labelData(s.data_solicitacao)}</span>
            <span className="text-muted-foreground">vale desde {rotuloCompetencia(s.competencia_efeito)}</span>
            <span className="text-muted-foreground">
              · {s.origem === "portal" ? "pedido do colaborador" : "registro do gestor"}
              {s.tipo === "ativar" && s.termo_modo === "papel_existente" ? " · termo em papel" : ""}
              {s.tipo === "ativar" && s.termo_modo === "documento" ? " · termo emitido" : ""}
            </span>
          </div>
        ))}
      </div>
      <Button asChild variant="link" className="h-auto px-0 text-xs">
        <Link to="/dp/adiantamentos">Ver relação de adiantamento do mês</Link>
      </Button>
    </div>
  );
}
