import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronDown, Clock, FileSignature, KeyRound, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  aplicarFichaNoCadastro, invalidarAposAplicarFicha, type FichaItem,
} from "@/hooks/useDpFichaImportacao";
import { garantirColaboradorNovo } from "@/lib/billing/excedente-colaboradores";
import { registrarCienciaRegra, salvarDependente } from "@/lib/dp/regras-oficial";
import {
  JUSTIFICATIVA_DIVERGENCIA_MIN, cienciaDivergenciaValida, resumoDivergencias,
} from "@/lib/dp/ficha-registro/divergencia";
import type { planejarLote } from "@/lib/dp/ficha-registro/efetivacao-lote";
import { cn } from "@/lib/utils";

type Plano = ReturnType<typeof planejarLote>;
type Falha = { nome: string; motivo: string };
type Resultado = { criados: number; semPdf: number; papelPendente: string[]; falhas: Falha[]; interrompido: string | null };

const SUGESTAO_JUSTIFICATIVA = "Valores atualizados conforme a folha de pagamento vigente.";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  itens: FichaItem[];
  plano: Plano;
}

/** Cria, de uma vez, o cadastro de todas as fichas do lote que estão prontas. */
export function EfetivarLoteDialog({ open, onOpenChange, companyId, itens, plano }: Props) {
  const qc = useQueryClient();
  const [justificativa, setJustificativa] = useState("");
  const [ciente, setCiente] = useState(false);
  const [rodando, setRodando] = useState(false);
  const [passo, setPasso] = useState<{ atual: number; total: number; nome: string } | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const total = plano.aptas.length;
  const papel = plano.aptas.filter((p) => p.envio.assinaturaPapel).length;
  const semAcesso = plano.aptas.filter((p) => p.semAcesso && !p.envio.assinaturaPapel).length;
  const semPonto = plano.aptas.filter((p) => !p.envio.possuiFolhaPonto).length;
  const temDivergencia = plano.comDivergencia.length > 0;
  const podeCriar = total > 0 && !!companyId && (!temDivergencia || cienciaDivergenciaValida(justificativa, ciente));

  const fechar = (o: boolean) => {
    if (rodando) return;
    onOpenChange(o);
    if (!o) {
      setResultado(null);
      setPasso(null);
      setJustificativa("");
      setCiente(false);
    }
  };

  const executar = async () => {
    if (!companyId || !podeCriar) return;
    setRodando(true);
    setResultado(null);
    const r: Resultado = { criados: 0, semPdf: 0, papelPendente: [], falhas: [], interrompido: null };
    const porId = new Map(itens.map((i) => [i.id, i]));
    // Fotografia do que foi confirmado: a lista pode atualizar enquanto cria.
    const fila = [...plano.aptas];
    try {
      for (let i = 0; i < fila.length; i++) {
        const p = fila[i];
        const item = porId.get(p.itemId);
        if (!item) continue;
        setPasso({ atual: i + 1, total: fila.length, nome: p.nome });
        // Franquia: mesma checagem da ficha individual; recusa interrompe o restante.
        try {
          await garantirColaboradorNovo(companyId, p.nome);
        } catch (e) {
          r.interrompido = e instanceof Error ? e.message : "Inclusão cancelada.";
          break;
        }
        try {
          const res = await aplicarFichaNoCadastro(companyId, {
            item,
            dados: p.envio.dados,
            cargoId: p.envio.cargoId,
            unidadeId: p.envio.unidadeId,
            setorId: p.envio.setorId,
            regime: p.envio.regime,
            atualizarExistente: false,
            jornada: p.envio.jornada,
            turnoId: p.envio.turnoId,
            camposPermitidos: null,
            anexarFicha: true,
            formaPagamento: p.envio.formaPagamento,
            possuiFolhaPonto: p.envio.possuiFolhaPonto,
            optanteAdiantamento: p.envio.optanteAdiantamento,
            assinaturaPapel: p.envio.assinaturaPapel,
            preadmissaoId: null,
          });
          r.criados += 1;
          if (res.assinatura === "falhou") r.papelPendente.push(p.nome);
          if (res.anexo === "falhou" || res.anexo === "sem_paginas") r.semPdf += 1;
          if (p.divergencias.length > 0) {
            try {
              await registrarCienciaRegra({
                companyId,
                tabela: "dp_colaboradores",
                registroId: res.colaboradorId,
                valorAntigo: { origem: "ficha_registro", ficha_item_id: item.id, efetivacao: "lote" },
                valorNovo: { tipo: "divergencia_ficha_registro", divergencias: resumoDivergencias(p.divergencias) },
                justificativa: justificativa.trim(),
                ciencia: true,
              });
            } catch { /* o cadastro não falha pelo registro de ciência (igual à ficha individual) */ }
          }
          if (!res.jaAplicado && p.dependentes.length > 0) {
            for (const dep of p.dependentes) {
              try {
                await salvarDependente(res.colaboradorId, {
                  nome: dep.nome, parentesco: dep.parentesco, data_nascimento: dep.data_nascimento,
                  cpf: dep.cpf, deficiencia: false, conta_irrf: true, conta_salario_familia: dep.parentesco !== "conjuge",
                  observacao: "Importado da Ficha de Registro.",
                });
              } catch { /* dependente com problema não desfaz o cadastro */ }
            }
          }
        } catch (e) {
          r.falhas.push({ nome: p.nome, motivo: e instanceof Error ? e.message : "Não foi possível criar o cadastro." });
        }
      }
    } finally {
      invalidarAposAplicarFicha(qc);
      setRodando(false);
      setPasso(null);
      setResultado(r);
    }
    if (r.criados > 0) toast.success(`${r.criados} ${r.criados === 1 ? "cadastro criado" : "cadastros criados"}.`);
  };

  const footer = resultado ? (
    <Button className="h-11 w-full sm:w-auto" onClick={() => fechar(false)}>Fechar</Button>
  ) : (
    <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button variant="outline" className="h-11" disabled={rodando} onClick={() => fechar(false)}>Cancelar</Button>
      <Button className="h-11" disabled={!podeCriar || rodando} onClick={executar}>
        {rodando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
        {rodando && passo ? `Criando ${passo.atual} de ${passo.total}` : `Criar ${total} ${total === 1 ? "cadastro" : "cadastros"}`}
      </Button>
    </div>
  );

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={fechar}
      title="Finalizar implantação"
      description="Cria o cadastro de todas as fichas prontas com o que já foi salvo no lote."
      className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
      footer={footer}
    >
      <div className="space-y-3 text-sm">
        {rodando && passo && (
          <div className="space-y-2 rounded-xl border bg-muted/30 p-3" aria-live="polite">
            <p className="font-medium tabular-nums">Criando {passo.atual} de {passo.total}</p>
            <p className="truncate text-xs text-muted-foreground">{passo.nome}</p>
            <Progress value={(passo.atual / Math.max(passo.total, 1)) * 100} className="h-2" />
            <p className="text-xs text-muted-foreground">Não feche esta janela até terminar.</p>
          </div>
        )}

        {resultado && (
          <div className="space-y-2">
            <div className="flex gap-2 rounded-xl border border-success/40 bg-success/10 p-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              <p className="font-medium">
                {resultado.criados} {resultado.criados === 1 ? "colaborador cadastrado" : "colaboradores cadastrados"}
              </p>
            </div>
            {resultado.semPdf > 0 && (
              <p className="text-xs text-muted-foreground">
                Em {resultado.semPdf} {resultado.semPdf === 1 ? "cadastro" : "cadastros"} o PDF da ficha não foi anexado: anexe pelos documentos do colaborador.
              </p>
            )}
            {resultado.papelPendente.length > 0 && (
              <p className="rounded-xl border border-warning/50 bg-warning/10 p-3 text-xs">
                Não deu para marcar "assina em papel" em {resultado.papelPendente.join(", ")}. O cadastro foi criado: marque em "Assinatura de documentos", na ficha do colaborador.
              </p>
            )}
            {resultado.interrompido && (
              <div className="rounded-xl border border-warning/50 bg-warning/10 p-3 text-xs">
                <p className="font-medium">Parou antes de terminar</p>
                <p>{resultado.interrompido}</p>
              </div>
            )}
            {resultado.falhas.length > 0 && (
              <div className="space-y-1 rounded-xl border border-destructive/40 bg-destructive/5 p-3">
                <p className="font-medium">{resultado.falhas.length} não {resultado.falhas.length === 1 ? "foi criada" : "foram criadas"} — confira na lista:</p>
                <ul className="space-y-1 text-xs">
                  {resultado.falhas.map((f, idx) => (
                    <li key={`${f.nome}-${idx}`}><span className="font-medium">{f.nome}:</span> {f.motivo}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {!rodando && !resultado && (
          <>
            <div className="flex gap-2 rounded-xl border border-primary/40 bg-primary/5 p-3">
              <UserPlus className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <p className="font-medium">
                  {total} {total === 1 ? "ficha vira colaborador" : "fichas viram colaboradores"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Com cargo, setor, salário, vínculo, ponto e contatos que já foram salvos. O PDF de cada ficha é anexado nos documentos.
                </p>
              </div>
            </div>

            <div className="flex gap-2 rounded-xl border p-3">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="text-xs">
                <span className="font-medium">Registro de ponto:</span> {total - semPonto} {total - semPonto === 1 ? "registra" : "registram"}
                {semPonto > 0 ? ` · ${semPonto} não ${semPonto === 1 ? "registra" : "registram"}` : " · ninguém marcado como \"não registra\""}.
                {" "}Se alguém não bate ponto, cancele, marque em "Escolher fichas" → "Aplicar dados" e volte aqui.
              </p>
            </div>

            {papel > 0 && (
              <div className="flex gap-2 rounded-xl border p-3">
                <FileSignature className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="text-xs">
                  <span className="font-medium">{papel} {papel === 1 ? "assina" : "assinam"} em papel</span> desde a admissão:
                  os documentos não vão para o celular e pedem a via impressa assinada.
                </p>
              </div>
            )}
            {semAcesso > 0 && (
              <div className="flex gap-2 rounded-xl border p-3">
                <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <p className="text-xs">
                  <span className="font-medium">{semAcesso} sem WhatsApp ou e-mail</span> entram no cadastro normalmente.
                  Sem contato não acessam o portal até alguém incluir; se não têm celular, marque "Assina em papel" na lista antes de criar.
                </p>
              </div>
            )}

            {plano.foraDoLote.length > 0 && (
              <Collapsible className="rounded-xl border p-3">
                <CollapsibleTrigger className="flex w-full items-center gap-2 text-left">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                  <span className="flex-1 text-xs font-medium">
                    {plano.foraDoLote.length} {plano.foraDoLote.length === 1 ? "fica" : "ficam"} para conferir uma a uma
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs">
                    {plano.foraDoLote.map((f) => (
                      <li key={f.itemId}><span className="font-medium">{f.nome}:</span> falta {f.motivos.join(", ")}</li>
                    ))}
                  </ul>
                </CollapsibleContent>
              </Collapsible>
            )}

            {temDivergencia && (
              <div className="space-y-2 rounded-xl border border-warning/50 bg-warning/10 p-3">
                <Collapsible>
                  <CollapsibleTrigger className="flex w-full items-center gap-2 text-left">
                    <span className="flex-1 text-xs font-medium">
                      {plano.comDivergencia.length} {plano.comDivergencia.length === 1 ? "ficha tem" : "fichas têm"} valor diferente do PDF (salário ou cargo)
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs">
                      {plano.comDivergencia.map((p) => (
                        <li key={p.itemId}>
                          <span className="font-medium">{p.nome}:</span>{" "}
                          {p.divergencias.map((d) => `${d.label} ${d.ficha} → ${d.sistema}`).join("; ")}
                        </li>
                      ))}
                    </ul>
                  </CollapsibleContent>
                </Collapsible>
                <p className="text-xs text-muted-foreground">
                  A ficha de registro é o documento da contabilidade. Explique uma vez o motivo; ele fica registrado em cada cadastro.
                </p>
                <Label htmlFor="efetivar-lote-just" className="text-xs">Justificativa</Label>
                <button
                  type="button"
                  onClick={() => setJustificativa(SUGESTAO_JUSTIFICATIVA)}
                  className={cn(
                    "block rounded-full border px-3 py-1.5 text-left text-xs",
                    justificativa === SUGESTAO_JUSTIFICATIVA ? "border-primary bg-primary/10 text-primary" : "bg-background",
                  )}
                >
                  {SUGESTAO_JUSTIFICATIVA}
                </button>
                <Textarea
                  id="efetivar-lote-just"
                  value={justificativa}
                  onChange={(e) => setJustificativa(e.target.value)}
                  maxLength={500}
                  rows={2}
                  placeholder="Ex.: salários reajustados depois da emissão da ficha"
                />
                {justificativa.trim().length > 0 && justificativa.trim().length < JUSTIFICATIVA_DIVERGENCIA_MIN && (
                  <p className="text-xs text-destructive">Escreva pelo menos {JUSTIFICATIVA_DIVERGENCIA_MIN} caracteres.</p>
                )}
                <label className="flex items-start gap-2 text-xs">
                  <Checkbox checked={ciente} onCheckedChange={(v) => setCiente(v === true)} className="mt-0.5" />
                  <span>Estou ciente de que estes valores ficam diferentes da ficha de registro.</span>
                </label>
              </div>
            )}

            {total === 0 && (
              <p className="text-xs text-muted-foreground">Nenhuma ficha está pronta ainda. Abra as fichas em "Atenção" para completar.</p>
            )}
          </>
        )}
      </div>
    </ResponsiveDialog>
  );
}
