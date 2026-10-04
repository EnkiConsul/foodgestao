import { AvisoViaFisica } from "@/components/dp/documentos/AvisoViaFisica";
import { DicaEnquadramento, useConferenciaDigitalizacao } from "./ConferenciaDigitalizacao";
import { useId, useRef, useState } from "react";
import {
  BadgeCheck,
  Banknote,
  Download,
  Eye,
  FileSignature,
  Loader2,
  Receipt,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { abrirDocumento, linkDocumentoAssinado } from "@/lib/documentoArquivo";
import { DocumentPreview } from "@/components/dp/DocumentPreview";
import { aceitaComprovante, docTipoLabel } from "@/lib/dp/documentoTipos";
import {
  avisoCompetenciaDivergente,
  competenciaDivergente,
  hojeISO,
  validarDataPagamento,
} from "@/lib/dp/comprovante-data";
import {
  brlParaCents,
  centsParaBRL,
  COMPROVANTE_MODALIDADES,
  exigeRecibo,
  MODALIDADE_AJUDA,
  MODALIDADE_LABEL,
  resumoQuitacao,
  validarQuitacao,
  type ComprovanteModalidade,
} from "@/lib/dp/comprovante-quitacao";
import { frasesLeitura, lerComprovante, type LeituraComprovante } from "@/lib/dp/comprovante-leitura";
import {
  emitirReciboEspecieParaAssinatura,
  reciboEspeciePdf,
} from "@/lib/dp/recibo-especie";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { conferirFavorecido } from "@/lib/dp/comprovante-favorecido";
import { useDpComprovantePagamento, type ComprovanteAlvo } from "@/hooks/useDpComprovantePagamento";
import {
  conferirValor,
  fraseConferenciaValor,
  JUSTIFICATIVA_VALOR_MIN,
} from "@/lib/dp/comprovante-valor";
import { Textarea } from "@/components/ui/textarea";
import {
  linkComplementar,
  useComprovantesComplementares,
  useDpComprovanteComplementarAcoes,
} from "@/hooks/useDpComprovantesComplementares";
import { consolidarQuitacao } from "@/lib/dp/comprovante-valor";

/** Valor líquido esperado do documento (recibo, contracheque, rescisão...). */
function useValorLiquido(documentoId: string, enabled = true) {
  return useQuery({
    queryKey: ["dp_doc_valor_liquido", documentoId],
    enabled: enabled && !!documentoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_documentos")
        .select("valor_liquido_cents")
        .eq("id", documentoId)
        .maybeSingle();
      if (error) throw error;
      return ((data as { valor_liquido_cents: number | null } | null)?.valor_liquido_cents ?? null) as number | null;
    },
  });
}

const MAX_MB = 15;

function validar(file: File): boolean {
  if (file.size > MAX_MB * 1024 * 1024) {
    toast.error(`Arquivo maior que ${MAX_MB} MB`);
    return false;
  }
  return true;
}

async function baixarComprovante(documentoId: string) {
  const ok = await abrirDocumento(documentoId, { variante: "comprovante", download: true });
  if (!ok) toast.error("Sem permissão para abrir este comprovante");
}

/**
 * Ver o comprovante dentro da própria tela. No celular (e no aplicativo
 * instalado) abrir outra aba é bloqueado, então nada aparecia.
 */
function useVerComprovante() {
  const [aberto, setAberto] = useState<{ url: string; nome: string | null; mime: string | null } | null>(null);
  const ver = async (documentoId: string) => {
    const link = await linkDocumentoAssinado(documentoId, 300, "comprovante");
    if (!link) {
      toast.error("Sem permissão para abrir este comprovante");
      return;
    }
    setAberto({ url: link.url, nome: link.fileName, mime: link.mimeType });
  };
  const visualizador = (
    <DocumentPreview
      open={!!aberto}
      onOpenChange={(v) => { if (!v) setAberto(null); }}
      title={aberto?.nome ?? "Comprovante de pagamento"}
      url={aberto?.url}
      mime={aberto?.mime ?? undefined}
    />
  );
  return { ver, visualizador };
}

/**
 * Recibo do valor pago em dinheiro: baixar para assinar à mão ou guardar no
 * acervo do colaborador pedindo assinatura no portal.
 */
function ReciboEspecieAcoes(props: { documentoId: string; jaEmitido: boolean }) {
  const [ocupado, setOcupado] = useState<"baixar" | "assinar" | null>(null);
  const [previa, setPrevia] = useState<{ url: string; revogar: () => void } | null>(null);

  const baixar = async () => {
    setOcupado("baixar");
    try {
      const pdf = await reciboEspeciePdf(props.documentoId);
      previa?.revogar();
      setPrevia(pdf);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOcupado(null);
    }
  };

  const pedirAssinatura = async () => {
    setOcupado("assinar");
    try {
      await emitirReciboEspecieParaAssinatura(props.documentoId);
      toast.success("Recibo enviado para assinatura no portal do colaborador");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOcupado(null);
    }
  };

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50/70 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase text-amber-800">
        <Banknote className="size-3.5" /> Recibo do Valor em Dinheiro
      </p>
      <p className="mb-2 text-xs text-amber-800">
        {props.jaEmitido
          ? "O recibo deste pagamento já foi gerado. Você pode emitir outra via quando precisar."
          : "Pagamento em dinheiro precisa de recibo assinado pelo colaborador (CLT, art. 464)."}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={ocupado !== null} onClick={() => void baixar()}>
          {ocupado === "baixar" ? (
            <Loader2 className="mr-1 size-4 animate-spin" />
          ) : (
            <Download className="mr-1 size-4" />
          )}
          Baixar Para Assinar à Mão
        </Button>
        <Button size="sm" disabled={ocupado !== null} onClick={() => void pedirAssinatura()}>
          {ocupado === "assinar" ? (
            <Loader2 className="mr-1 size-4 animate-spin" />
          ) : (
            <FileSignature className="mr-1 size-4" />
          )}
          Pedir Assinatura no Portal
        </Button>
      </div>
      <DocumentPreview
        open={!!previa}
        onOpenChange={(v) => {
          if (!v) {
            previa?.revogar();
            setPrevia(null);
          }
        }}
        title="Recibo de pagamento em dinheiro"
        url={previa?.url}
        mime="application/pdf"
      />
    </div>
  );
}

/**
 * Formulário de anexo: o arquivo é lido pelo sistema (data, valor e tipo de
 * operação), o gestor confere a data — agora obrigatória — e informa como o
 * pagamento foi feito.
 */
export function ComprovanteAnexarDialog(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  alvo: ComprovanteAlvo;
  /** Já existe comprovante: o envio substitui o anterior. */
  substituir?: boolean;
  documentoTitulo?: string | null;
  colaboradorNome?: string | null;
  competencia?: string | null;
  pagoEmAtual?: string | null;
  modalidadeAtual?: string | null;
  valorBancarioAtual?: number | null;
  valorEspecieAtual?: number | null;
  /** Comprovante complementar: soma ao que já foi comprovado. */
  complementar?: { jaComprovadoCents: number };
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const campoId = useId();
  const [pagoEm, setPagoEm] = useState(props.pagoEmAtual ?? "");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [lendo, setLendo] = useState(false);
  const [leitura, setLeitura] = useState<LeituraComprovante | null>(null);
  const [modalidade, setModalidade] = useState<ComprovanteModalidade>(
    (props.modalidadeAtual as ComprovanteModalidade) ?? "bancario",
  );
  const [bancario, setBancario] = useState(
    props.valorBancarioAtual ? centsParaBRL(props.valorBancarioAtual).replace("R$", "").trim() : "",
  );
  const [especie, setEspecie] = useState(
    props.valorEspecieAtual ? centsParaBRL(props.valorEspecieAtual).replace("R$", "").trim() : "",
  );
  const [confirmado, setConfirmado] = useState(false);
  const [cienteFavorecido, setCienteFavorecido] = useState(false);
  const [cienteValor, setCienteValor] = useState(false);
  const [justValor, setJustValor] = useState("");
  const [liquidoTexto, setLiquidoTexto] = useState<string | null>(null);
  const liquido = useValorLiquido(props.alvo.documentoId, props.open);
  const { selectedCompanyId } = useCompanyContext();
  const colegas = useQuery({
    queryKey: ["dp_colaboradores_nomes", selectedCompanyId],
    enabled: props.open && !!selectedCompanyId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_colaboradores")
        .select("id,nome")
        .eq("company_id", selectedCompanyId!);
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string }[];
    },
  });
  const conferencia = conferirFavorecido(
    leitura?.favorecido,
    props.colaboradorNome,
    colegas.data ?? [],
    props.alvo.colaboradorId,
  );
  const favorecidoDivergente =
    conferencia.status === "outro_colaborador" || conferencia.status === "terceiro";
  const [erro, setErro] = useState<string | null>(null);
  const { anexar, ocupado: ocupadoPrincipal } = useDpComprovantePagamento();
  const extra = useDpComprovanteComplementarAcoes();
  const ocupado = ocupadoPrincipal || extra.ocupado;
  const jaComprovado = props.complementar?.jaComprovadoCents ?? 0;
  const esperadoCents =
    liquidoTexto !== null ? brlParaCents(liquidoTexto) : (liquido.data ?? null);
  const confValor = conferirValor(
    esperadoCents,
    (modalidade === "especie" ? 0 : brlParaCents(bancario) ?? 0) + jaComprovado,
    modalidade === "bancario" ? null : brlParaCents(especie),
  );
  const valorDivergente = confValor.status === "menor" || confValor.status === "maior";
  const fraseValor = fraseConferenciaValor(confValor);
  const hoje = hojeISO();

  const divergente = competenciaDivergente(pagoEm, props.competencia);
  const aviso =
    divergente && props.competencia ? avisoCompetenciaDivergente(pagoEm, props.competencia) : null;
  const fraseLida = leitura ? frasesLeitura(leitura) : null;

  const limpar = () => {
    setErro(null);
    setArquivo(null);
    setLeitura(null);
    setConfirmado(false);
    setCienteFavorecido(false);
    setCienteValor(false);
    setJustValor("");
    setLiquidoTexto(null);
    setLendo(false);
    setPagoEm(props.pagoEmAtual ?? "");
  };

  const escolherArquivo = async (file: File) => {
    setArquivo(file);
    setErro(null);
    setConfirmado(false);
    setCienteFavorecido(false);
    setLendo(true);
    try {
      const lido = await lerComprovante(file);
      setLeitura(lido);
      if (lido.pagoEm && !pagoEm) setPagoEm(lido.pagoEm);
      if (lido.valorCents && !bancario && modalidade === "bancario") {
        setBancario((lido.valorCents / 100).toFixed(2).replace(".", ","));
      }
    } finally {
      setLendo(false);
    }
  };

  const importar = () => {
    if (!arquivo) {
      inputRef.current?.click();
      return;
    }
    const check = validarDataPagamento(pagoEm, hoje);
    if (!check.ok) {
      setErro(check.motivo);
      return;
    }
    if (!check.valor) {
      setErro("Informe a data em que o pagamento foi feito.");
      return;
    }
    const quitacao = validarQuitacao({
      modalidade,
      bancarioCents: brlParaCents(bancario),
      especieCents: brlParaCents(especie),
    });
    if (!quitacao.ok) {
      setErro(quitacao.motivo);
      return;
    }
    if (favorecidoDivergente && !cienteFavorecido) {
      setErro("Confirme a ciência sobre o favorecido do comprovante antes de importar.");
      return;
    }
    if (liquidoTexto !== null && liquidoTexto.trim() && !brlParaCents(liquidoTexto)) {
      setErro("Valor líquido do documento inválido.");
      return;
    }
    if (valorDivergente && (!cienteValor || justValor.trim().length < JUSTIFICATIVA_VALOR_MIN)) {
      setErro(`O valor pago não bate com o documento: marque a ciência e justifique (mín. ${JUSTIFICATIVA_VALOR_MIN} caracteres).`);
      return;
    }
    if (divergente && !confirmado) {
      setErro(aviso ?? "Confirme a competência do comprovante.");
      return;
    }
    setErro(null);
    const quitacaoFinal = {
          modalidade: quitacao.modalidade,
          valorBancarioCents: quitacao.bancarioCents,
          valorEspecieCents: quitacao.especieCents,
          leitura: {
            ...((leitura?.bruto as object | null) ?? {}),
            conferencia_favorecido: conferencia.status,
            ciente_favorecido: favorecidoDivergente ? cienteFavorecido : null,
            conferencia_valor: confValor.status,
            valor_esperado_cents: confValor.esperadoCents,
            valor_comprovado_cents: confValor.comprovadoCents,
            diferenca_cents: confValor.diferencaCents,
            justificativa_valor: valorDivergente ? justValor.trim() : null,
            complementar: true,
          },
        };
    if (props.complementar) {
      extra.adicionar.mutate(
        { alvo: props.alvo, file: arquivo, pagoEm: check.valor, quitacao: quitacaoFinal },
        { onSuccess: () => { limpar(); props.onOpenChange(false); } },
      );
      return;
    }
    anexar.mutate(
      {
        alvo: props.alvo,
        file: arquivo,
        pagoEm: check.valor,
        confirmarCompetencia: divergente && confirmado,
        quitacao: {
          modalidade: quitacao.modalidade,
          valorBancarioCents: quitacao.bancarioCents,
          valorEspecieCents: quitacao.especieCents,
          leitura: {
            ...((leitura?.bruto as object | null) ?? {}),
            conferencia_favorecido: conferencia.status,
            ciente_favorecido: favorecidoDivergente ? cienteFavorecido : null,
            conferencia_valor: confValor.status,
            valor_esperado_cents: confValor.esperadoCents,
            valor_comprovado_cents: confValor.comprovadoCents,
            diferenca_cents: confValor.diferencaCents,
            justificativa_valor: valorDivergente ? justValor.trim() : null,
          },
        },
      },
      {
        onSuccess: async () => {
          const novo = liquidoTexto !== null ? brlParaCents(liquidoTexto) : undefined;
          if (novo !== undefined && novo !== (liquido.data ?? null)) {
            const { error } = await supabase.rpc("dp_documento_definir_valor_liquido", {
              p_documento_id: props.alvo.documentoId,
              p_valor_cents: novo,
            });
            if (error) toast.error("Comprovante salvo, mas o valor líquido do documento não foi atualizado.");
          }
          void liquido.refetch();
          props.onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog
      open={props.open}
      onOpenChange={(v) => {
        if (!v) limpar();
        props.onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[92vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {props.complementar ? "Adicionar Comprovante Complementar" : props.substituir ? "Substituir Comprovante de Pagamento" : "Anexar Comprovante de Pagamento"}
          </DialogTitle>
          <DialogDescription>
            Escolha o arquivo: o sistema lê a data e o valor para você conferir.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Colaborador</p>
            <p className="break-words text-sm font-medium">{props.colaboradorNome ?? "Não informado"}</p>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Tipo</p>
            <p className="break-words text-sm font-medium">{docTipoLabel(props.alvo.tipo)}</p>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Competência</p>
            <p className="text-sm font-medium">{props.competencia ?? "Não informada"}</p>
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept="application/pdf,image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file || !validar(file)) return;
            void conferirFoto(file).then((ok) => ok && escolherArquivo(ok));
          }}
        />

        {dialogoFoto}
        <AvisoViaFisica />
        <DicaEnquadramento />
        <div className="grid gap-1.5">
          <Label className="text-xs">Arquivo do comprovante</Label>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={ocupado}>
              <Upload className="mr-1 size-4" /> Escolher Arquivo
            </Button>
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {arquivo ? arquivo.name : `PDF, foto ou print, até ${MAX_MB} MB`}
            </span>
          </div>
          {lendo ? (
            <p className="flex items-center gap-1.5 text-xs text-primary">
              <Loader2 className="size-3.5 animate-spin" /> Lendo o comprovante…
            </p>
          ) : null}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor={campoId} className="text-xs">Data do pagamento</Label>
          <Input
            id={campoId}
            type="date"
            max={hoje}
            value={pagoEm}
            aria-invalid={!!erro}
            aria-describedby={erro ? `${campoId}-erro` : undefined}
            onChange={(e) => {
              setPagoEm(e.target.value);
              setLeitura(leitura ? { ...leitura, origem: null } : null);
              setConfirmado(false);
              setErro(null);
            }}
          />
          {fraseLida ? <p className="text-xs text-primary">{fraseLida}</p> : null}
          {!pagoEm && arquivo && !lendo ? (
            <p className="text-xs text-amber-700">
              Não foi possível ler a data no comprovante. Informe a data do pagamento.
            </p>
          ) : null}
        </div>

        <div className="grid gap-1.5">
          <Label className="text-xs">Como o pagamento foi feito</Label>
          <div className="flex flex-wrap gap-2">
            {COMPROVANTE_MODALIDADES.map((m) => (
              <Button
                key={m}
                type="button"
                size="sm"
                variant={modalidade === m ? "default" : "outline"}
                onClick={() => {
                  setModalidade(m);
                  setErro(null);
                }}
              >
                {MODALIDADE_LABEL[m]}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{MODALIDADE_AJUDA[modalidade]}</p>
        </div>

        {modalidade !== "bancario" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {modalidade === "misto" ? (
              <div className="grid gap-1.5">
                <Label htmlFor={`${campoId}-banco`} className="text-xs">Valor pago na conta (R$)</Label>
                <Input
                  id={`${campoId}-banco`}
                  inputMode="decimal"
                  placeholder="0,00"
                  value={bancario}
                  onChange={(e) => {
                    setBancario(e.target.value);
                    setErro(null);
                  }}
                />
              </div>
            ) : null}
            <div className="grid gap-1.5">
              <Label htmlFor={`${campoId}-especie`} className="text-xs">Valor pago em dinheiro (R$)</Label>
              <Input
                id={`${campoId}-especie`}
                inputMode="decimal"
                placeholder="0,00"
                value={especie}
                onChange={(e) => {
                  setEspecie(e.target.value);
                  setErro(null);
                }}
              />
            </div>
          </div>
        ) : null}

        {modalidade !== "bancario" ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
            Depois de importar, o sistema gera o recibo do valor em dinheiro para assinatura no portal
            do colaborador — ou para você baixar e colher a assinatura à mão.
          </p>
        ) : null}

        <div className="grid gap-1.5">
          <Label htmlFor={`${campoId}-liquido`} className="text-xs">Valor líquido do documento (R$)</Label>
          <Input
            id={`${campoId}-liquido`}
            inputMode="decimal"
            placeholder={liquido.isLoading ? "Carregando…" : "Não informado"}
            value={liquidoTexto ?? (liquido.data ? centsParaBRL(liquido.data).replace("R$", "").trim() : "")}
            onChange={(e) => {
              setLiquidoTexto(e.target.value);
              setCienteValor(false);
              setErro(null);
            }}
          />
          {confValor.status === "exato" ? (
            <p className="flex items-center gap-1.5 text-xs text-emerald-700">
              <BadgeCheck className="size-3.5" /> {fraseValor}
            </p>
          ) : confValor.status === "sem_referencia" ? (
            <p className="text-xs text-muted-foreground">
              Informe o líquido para o sistema conferir o valor pago.
            </p>
          ) : null}
        </div>

        {jaComprovado > 0 ? (
          <p className="text-xs text-muted-foreground">
            Já comprovado em outros comprovantes: {centsParaBRL(jaComprovado)}. A conferência soma este novo valor.
          </p>
        ) : null}
        {valorDivergente ? (
          <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
            <p>
              Documento: <strong>{centsParaBRL(confValor.esperadoCents)}</strong> · Comprovado:{" "}
              <strong>{centsParaBRL(confValor.comprovadoCents)}</strong>
            </p>
            <p className="font-medium">{fraseValor}</p>
            <label className="flex items-start gap-2 text-foreground">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={cienteValor}
                onChange={(e) => {
                  setCienteValor(e.target.checked);
                  setErro(null);
                }}
              />
              <span>Estou ciente da diferença de valor e quero importar mesmo assim.</span>
            </label>
            {cienteValor ? (
              <Textarea
                rows={2}
                placeholder="Justifique (ex.: primeira parcela, desconto já pago)"
                value={justValor}
                onChange={(e) => {
                  setJustValor(e.target.value);
                  setErro(null);
                }}
              />
            ) : null}
          </div>
        ) : null}

        {conferencia.status === "confere" ? (
          <p className="flex items-center gap-1.5 text-xs text-emerald-700">
            <BadgeCheck className="size-3.5" /> Favorecido confere: {conferencia.favorecido.toUpperCase()}
          </p>
        ) : null}
        {favorecidoDivergente ? (
          <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            {conferencia.status === "outro_colaborador" ? (
              <p>
                <strong>Provável troca de arquivo:</strong> este comprovante está em nome de{" "}
                {conferencia.outroNome.toUpperCase()}, outro colaborador da empresa. Confira se escolheu o
                arquivo certo.
              </p>
            ) : (
              <p>
                O comprovante está em nome de <strong>{conferencia.favorecido.toUpperCase()}</strong>, diferente
                do colaborador ({(props.colaboradorNome ?? "").toUpperCase()}). Pagamento a terceiro só vale com
                autorização escrita do colaborador (Art. 464 da CLT): importe o Termo de Autorização nos
                documentos dele.
              </p>
            )}
            <label className="flex items-start gap-2 text-foreground">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={cienteFavorecido}
                onChange={(e) => {
                  setCienteFavorecido(e.target.checked);
                  setErro(null);
                }}
              />
              <span>
                {conferencia.status === "outro_colaborador"
                  ? "Conferi e este é o comprovante correto deste documento."
                  : "Estou ciente: o pagamento foi feito a terceiro com autorização escrita do colaborador."}
              </span>
            </label>
          </div>
        ) : null}

        {erro ? (
          <p id={`${campoId}-erro`} role="alert" className="text-xs text-destructive">{erro}</p>
        ) : null}

        {aviso ? (
          <label className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={confirmado}
              onChange={(e) => {
                setConfirmado(e.target.checked);
                setErro(null);
              }}
            />
            <span>{aviso}</span>
          </label>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => props.onOpenChange(false)} disabled={ocupado}>
            Cancelar
          </Button>
          <Button onClick={importar} disabled={ocupado || !arquivo || lendo}>
            {anexar.isPending || extra.adicionar.isPending ? (
              <Loader2 className="mr-1 size-4 animate-spin" />
            ) : (
              <Upload className="mr-1 size-4" />
            )}
            Importar Comprovante
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Atalho no card/linha do documento: abre o formulário de anexo sem precisar
 * entrar nos detalhes.
 */
export function ComprovanteAcaoBotao(props: {
  alvo: ComprovanteAlvo;
  temComprovante: boolean;
  /** Somente leitura (portal do colaborador). */
  somenteLeitura?: boolean;
  /** Rótulo curto exibido ao lado do ícone (usado no card mobile). */
  rotulo?: string;
  documentoTitulo?: string | null;
  colaboradorNome?: string | null;
  competencia?: string | null;
  className?: string;
}) {
  const [anexarOpen, setAnexarOpen] = useState(false);
  const { anexar, ocupado } = useDpComprovantePagamento();
  const { ver, visualizador } = useVerComprovante();
  if (!aceitaComprovante(props.alvo.tipo)) return null;

  if (props.somenteLeitura) {
    if (!props.temComprovante) return null;
    return (
      <>
        <Button
          size="sm"
          variant="ghost"
          className={props.className}
          aria-label="Ver comprovante de pagamento"
          onClick={() => void ver(props.alvo.documentoId)}
        >
          <Receipt className="size-4 text-emerald-600" />
          {props.rotulo ? <span className="ml-1">{props.rotulo}</span> : null}
        </Button>
        {visualizador}
      </>
    );
  }

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className={props.className}
        disabled={ocupado}
        aria-label={props.temComprovante ? "Ver comprovante de pagamento" : "Importar comprovante de pagamento"}
        title={props.temComprovante ? "Comprovante de pagamento anexado" : "Importar comprovante de pagamento"}
        onClick={() =>
          props.temComprovante ? void ver(props.alvo.documentoId) : setAnexarOpen(true)
        }
      >
        {anexar.isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : props.temComprovante ? (
          <Receipt className="size-4 text-emerald-600" />
        ) : (
          <Receipt className="size-4 text-muted-foreground" />
        )}
        {props.rotulo ? <span className="ml-1">{props.rotulo}</span> : null}
      </Button>
      <ComprovanteAnexarDialog
        open={anexarOpen}
        onOpenChange={setAnexarOpen}
        alvo={props.alvo}
        substituir={props.temComprovante}
        documentoTitulo={props.documentoTitulo}
        colaboradorNome={props.colaboradorNome}
        competencia={props.competencia}
      />
      {visualizador}
    </>
  );
}

/**
 * Bloco de comprovante nos detalhes do documento: importar, ver, baixar,
 * conferir a forma de pagamento, emitir o recibo do dinheiro e remover.
 */
export function ComprovantePagamentoPanel(props: {
  alvo: ComprovanteAlvo;
  comprovante: {
    file_name: string | null;
    pago_em: string | null;
    uploaded_at: string | null;
    tem: boolean;
    modalidade?: string | null;
    valor_bancario_cents?: number | null;
    valor_especie_cents?: number | null;
    recibo_documento_id?: string | null;
  };
  /** Versão anterior do documento: o comprovante é da versão substituída. */
  versaoAnterior?: boolean;
  somenteLeitura?: boolean;
  documentoTitulo?: string | null;
  colaboradorNome?: string | null;
  competencia?: string | null;
}) {
  const [anexarOpen, setAnexarOpen] = useState(false);
  const { remover, ocupado } = useDpComprovantePagamento();
  const { ver, visualizador } = useVerComprovante();
  const liquido = useValorLiquido(props.alvo.documentoId, aceitaComprovante(props.alvo.tipo));
  const extras = useComprovantesComplementares(
    props.alvo.documentoId,
    aceitaComprovante(props.alvo.tipo) && !props.somenteLeitura,
  );
  const extraAcoes = useDpComprovanteComplementarAcoes();
  const [complementarOpen, setComplementarOpen] = useState(false);
  const [extraPreview, setExtraPreview] = useState<{ url: string; nome: string; mime: string | null } | null>(null);
  if (!aceitaComprovante(props.alvo.tipo)) return null;

  const { comprovante } = props;
  // Portal: sem comprovante anexado, nem o bloco aparece.
  if (props.somenteLeitura && !comprovante.tem) return null;

  const quitacao = resumoQuitacao({
    modalidade: comprovante.modalidade,
    valor_bancario_cents: comprovante.valor_bancario_cents,
    valor_especie_cents: comprovante.valor_especie_cents,
  });

  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
          <Receipt className="size-3.5" /> Comprovante de Pagamento
        </div>
        {comprovante.tem ? (
          <Badge variant="outline" className="border-emerald-300 text-emerald-700">
            <BadgeCheck className="mr-1 size-3" /> Anexado
          </Badge>
        ) : (
          <Badge variant="outline" className="border-amber-300 text-amber-700">Sem comprovante</Badge>
        )}
      </div>

      {comprovante.tem ? (
        <div className="space-y-2 text-sm">
          <p className="break-words text-muted-foreground">
            {comprovante.file_name ?? "Comprovante"}
            {comprovante.pago_em ? ` · pago em ${comprovante.pago_em.split("-").reverse().join("/")}` : ""}
          </p>
          <p className="break-words text-xs text-muted-foreground">{quitacao}</p>
          {(extras.data ?? []).length > 0 ? (
            <ul className="space-y-1 rounded-md border bg-muted/30 p-2 text-xs">
              <li className="text-muted-foreground">
                Comprovante 1: {centsParaBRL(
                  Number(comprovante.modalidade === "especie" ? 0 : comprovante.valor_bancario_cents ?? 0) +
                    Number(comprovante.modalidade === "bancario" ? 0 : comprovante.valor_especie_cents ?? 0),
                )}
              </li>
              {(extras.data ?? []).map((e, i) => (
                <li key={e.id} className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 break-words">
                    Comprovante {i + 2}: {resumoQuitacao(e)} · pago em {e.pago_em.split("-").reverse().join("/")}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    onClick={async () => {
                      const url = await linkComplementar(e.file_path);
                      if (!url) return toast.error("Sem permissão para abrir este comprovante");
                      setExtraPreview({ url, nome: e.file_name, mime: e.mime_type });
                    }}
                  >
                    <Eye className="size-3.5" />
                  </Button>
                  {!props.somenteLeitura && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-destructive"
                      aria-label="Remover comprovante complementar"
                      disabled={extraAcoes.ocupado}
                      onClick={() => extraAcoes.excluir.mutate(e.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
          {(() => {
            const extraCents = (extras.data ?? []).reduce(
              (t, e) => t + Number(e.valor_bancario_cents ?? 0) + Number(e.valor_especie_cents ?? 0),
              0,
            );
            const c = consolidarQuitacao({
              liquidoCents: liquido.data ?? null,
              temPrincipal: true,
              principalBancarioCents: comprovante.modalidade === "especie" ? null : comprovante.valor_bancario_cents,
              principalEspecieCents: comprovante.modalidade === "bancario" ? null : comprovante.valor_especie_cents,
              extraQtd: (extras.data ?? []).length,
              extraCents,
            });
            if (c.status === "sem_referencia") return null;
            return (
              <>
              {c.status === "menor" && !props.somenteLeitura ? (
                <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
                  <p>Quitação parcial: {fraseConferenciaValor(c)}.</p>
                  <Button size="sm" disabled={extraAcoes.ocupado} onClick={() => setComplementarOpen(true)}>
                    <Upload className="mr-1 size-4" /> Adicionar Comprovante Complementar
                  </Button>
                  <ComprovanteAnexarDialog
                    open={complementarOpen}
                    onOpenChange={setComplementarOpen}
                    alvo={props.alvo}
                    documentoTitulo={props.documentoTitulo}
                    colaboradorNome={props.colaboradorNome}
                    competencia={props.competencia}
                    complementar={{ jaComprovadoCents: c.comprovadoCents }}
                  />
                </div>
              ) : null}
              <p
                className={
                  c.status === "exato"
                    ? "flex flex-wrap items-center gap-1 text-xs text-emerald-700"
                    : "flex flex-wrap items-center gap-1 text-xs text-amber-700"
                }
              >
                Líquido: {centsParaBRL(c.esperadoCents)} | Comprovado: {centsParaBRL(c.comprovadoCents)}
                {c.status === "exato" ? (c.qtd > 1 ? ` (${c.qtd} comprovantes) ✓` : " ✓") : ` · ${fraseConferenciaValor(c)}`}
              </p>
              </>
            );
          })()}
          {props.versaoAnterior && (
            <p className="text-[11px] text-amber-700">
              Comprovante referente à versão anterior do documento.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void ver(props.alvo.documentoId)}>
              <Eye className="mr-1 size-4" /> Ver
            </Button>
            <Button size="sm" variant="outline" onClick={() => void baixarComprovante(props.alvo.documentoId)}>
              <Download className="mr-1 size-4" /> Baixar
            </Button>
            {!props.somenteLeitura && (
              <>
                <Button size="sm" variant="outline" disabled={ocupado} onClick={() => setAnexarOpen(true)}>
                  <Upload className="mr-1 size-4" /> Substituir
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  disabled={ocupado}
                  onClick={() => remover.mutate(props.alvo)}
                >
                  <Trash2 className="mr-1 size-4" /> Remover
                </Button>
              </>
            )}
          </div>
          {!props.somenteLeitura && exigeRecibo(comprovante.modalidade) ? (
            <ReciboEspecieAcoes
              documentoId={props.alvo.documentoId}
              jaEmitido={!!comprovante.recibo_documento_id}
            />
          ) : null}
        </div>
      ) : props.somenteLeitura ? (
        <p className="text-sm text-muted-foreground">
          A empresa ainda não anexou o comprovante de pagamento deste documento.
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Escolha o arquivo do comprovante: o sistema lê a data e o valor, e você informa como o
            pagamento foi feito.
          </p>
          <Button size="sm" disabled={ocupado} onClick={() => setAnexarOpen(true)}>
            <Upload className="mr-1 size-4" /> Anexar Comprovante
          </Button>
        </div>
      )}
      <ComprovanteAnexarDialog
        open={anexarOpen}
        onOpenChange={setAnexarOpen}
        alvo={props.alvo}
        substituir={comprovante.tem}
        documentoTitulo={props.documentoTitulo}
        colaboradorNome={props.colaboradorNome}
        competencia={props.competencia}
        pagoEmAtual={comprovante.pago_em}
        modalidadeAtual={comprovante.modalidade}
        valorBancarioAtual={comprovante.valor_bancario_cents}
        valorEspecieAtual={comprovante.valor_especie_cents}
      />
      {visualizador}
      <DocumentPreview
        open={!!extraPreview}
        onOpenChange={(v) => { if (!v) setExtraPreview(null); }}
        title={extraPreview?.nome ?? "Comprovante complementar"}
        url={extraPreview?.url}
        mime={extraPreview?.mime ?? undefined}
      />
    </div>
  );
}
