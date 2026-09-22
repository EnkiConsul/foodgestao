import { useId, useRef, useState } from "react";
import { BadgeCheck, Download, Eye, Loader2, Receipt, Trash2, Upload } from "lucide-react";
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
import { aceitaComprovante } from "@/lib/dp/documentoTipos";
import { hojeISO, validarDataPagamento } from "@/lib/dp/comprovante-data";
import { useDpComprovantePagamento, type ComprovanteAlvo } from "@/hooks/useDpComprovantePagamento";

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
  const [aberto, setAberto] = useState<{ url: string; nome: string | null } | null>(null);
  const ver = async (documentoId: string) => {
    const link = await linkDocumentoAssinado(documentoId, 300, "comprovante");
    if (!link) {
      toast.error("Sem permissão para abrir este comprovante");
      return;
    }
    setAberto({ url: link.url, nome: link.fileName });
  };
  const visualizador = (
    <DocumentPreview
      open={!!aberto}
      onOpenChange={(v) => { if (!v) setAberto(null); }}
      title={aberto?.nome ?? "Comprovante de pagamento"}
      url={aberto?.url}
    />
  );
  return { ver, visualizador };
}

/**
 * Formulário de anexo: primeiro a data do pagamento, depois a escolha do
 * arquivo. Antes o clique abria direto o seletor e ninguém sabia que podia
 * informar a data.
 */
export function ComprovanteAnexarDialog(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  alvo: ComprovanteAlvo;
  /** Já existe comprovante: o envio substitui o anterior. */
  substituir?: boolean;
  documentoTitulo?: string | null;
  colaboradorNome?: string | null;
  pagoEmAtual?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const campoId = useId();
  const [pagoEm, setPagoEm] = useState(props.pagoEmAtual ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const { anexar, ocupado } = useDpComprovantePagamento();
  const hoje = hojeISO();

  const escolherArquivo = () => {
    const check = validarDataPagamento(pagoEm, hoje);
    if (!check.ok) {
      setErro(check.motivo);
      return;
    }
    setErro(null);
    inputRef.current?.click();
  };

  return (
    <Dialog
      open={props.open}
      onOpenChange={(v) => {
        if (!v) {
          setErro(null);
          setPagoEm(props.pagoEmAtual ?? "");
        }
        props.onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {props.substituir ? "Substituir comprovante de pagamento" : "Anexar comprovante de pagamento"}
          </DialogTitle>
          <DialogDescription>
            {[props.colaboradorNome, props.documentoTitulo].filter(Boolean).join(" · ") ||
              "Informe a data do pagamento e escolha o arquivo (PDF ou imagem, até 15 MB)."}
          </DialogDescription>
        </DialogHeader>

        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept="application/pdf,image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file || !validar(file)) return;
            const check = validarDataPagamento(pagoEm, hoje);
            if (!check.ok) {
              setErro(check.motivo);
              return;
            }
            anexar.mutate(
              { alvo: props.alvo, file, pagoEm: check.valor },
              { onSuccess: () => props.onOpenChange(false) },
            );
          }}
        />

        <div className="grid gap-1.5">
          <Label htmlFor={campoId} className="text-xs">Data do pagamento (opcional)</Label>
          <Input
            id={campoId}
            type="date"
            max={hoje}
            value={pagoEm}
            aria-invalid={!!erro}
            aria-describedby={erro ? `${campoId}-erro` : undefined}
            onChange={(e) => {
              setPagoEm(e.target.value);
              setErro(null);
            }}
          />
          {erro ? (
            <p id={`${campoId}-erro`} role="alert" className="text-xs text-destructive">{erro}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Arquivo em PDF ou imagem, até {MAX_MB} MB.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => props.onOpenChange(false)} disabled={ocupado}>
            Cancelar
          </Button>
          <Button onClick={escolherArquivo} disabled={ocupado}>
            {anexar.isPending ? (
              <Loader2 className="mr-1 size-4 animate-spin" />
            ) : (
              <Upload className="mr-1 size-4" />
            )}
            Importar comprovante
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
      {visualizador}
    </>
  );
}

/**
 * Bloco de comprovante nos detalhes do documento: importar, ver, baixar,
 * informar a data do pagamento e remover.
 */
export function ComprovantePagamentoPanel(props: {
  alvo: ComprovanteAlvo;
  comprovante: {
    file_name: string | null;
    pago_em: string | null;
    uploaded_at: string | null;
    tem: boolean;
  };
  /** Versão anterior do documento: o comprovante é da versão substituída. */
  versaoAnterior?: boolean;
  somenteLeitura?: boolean;
  documentoTitulo?: string | null;
  colaboradorNome?: string | null;
}) {
  const [anexarOpen, setAnexarOpen] = useState(false);
  const { remover, ocupado } = useDpComprovantePagamento();
  const { ver, visualizador } = useVerComprovante();
  if (!aceitaComprovante(props.alvo.tipo)) return null;

  const { comprovante } = props;
  // Portal: sem comprovante anexado, nem o bloco aparece.
  if (props.somenteLeitura && !comprovante.tem) return null;

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
        </div>
      ) : props.somenteLeitura ? (
        <p className="text-sm text-muted-foreground">
          A empresa ainda não anexou o comprovante de pagamento deste documento.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-1.5 sm:max-w-[220px]">
            <Label className="text-xs">Data do pagamento (opcional)</Label>
            <Input type="date" value={pagoEm} onChange={(e) => setPagoEm(e.target.value)} />
          </div>
          <Button size="sm" disabled={ocupado} onClick={() => inputRef.current?.click()}>
            {anexar.isPending ? (
              <Loader2 className="mr-1 size-4 animate-spin" />
            ) : (
              <Upload className="mr-1 size-4" />
            )}
            Importar comprovante
          </Button>
        </div>
      )}
      {visualizador}
    </div>
  );
}
