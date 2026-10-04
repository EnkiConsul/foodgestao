import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, ScanLine, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { avaliarQualidadeImagem, type ResultadoQualidade } from "@/lib/storage/qualidadeDigitalizacao";
import { cn } from "@/lib/utils";

export const DICAS_ENQUADRAMENTO = [
  "Papel inteiro na foto, com as 4 bordas visíveis e uma pequena margem.",
  "Celular paralelo ao papel (de cima, sem inclinar), sobre fundo escuro e liso.",
  "Boa luz, sem sombra da mão ou do celular e sem flash direto.",
  "Toque na tela sobre o texto para focar; assinatura e números precisam estar legíveis.",
];

type Pendente = { arquivo: File; resolve: (f: File | null) => void };

/**
 * Antes de enviar uma foto de documento, mostra a imagem, as orientações de
 * enquadramento e o resultado da avaliação de qualidade. PDFs passam direto.
 *
 * Uso: `const { conferir, dialogo } = useConferenciaDigitalizacao();`
 * `const final = await conferir(arquivo); if (!final) return;` e renderize `{dialogo}`.
 */
export function useConferenciaDigitalizacao(opcoes?: { onTirarOutra?: () => void }) {
  const [pendente, setPendente] = useState<Pendente | null>(null);
  const [resultado, setResultado] = useState<ResultadoQualidade | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const tirarOutraRef = useRef(opcoes?.onTirarOutra);
  tirarOutraRef.current = opcoes?.onTirarOutra;

  const conferir = useCallback((arquivo: File): Promise<File | null> => {
    if (!arquivo.type.startsWith("image/") || /heic|heif/i.test(arquivo.type)) {
      return Promise.resolve(arquivo);
    }
    return new Promise((resolve) => setPendente({ arquivo, resolve }));
  }, []);

  useEffect(() => {
    setResultado(null);
    setErro(null);
    if (!pendente) { setUrl(null); return; }
    const u = URL.createObjectURL(pendente.arquivo);
    setUrl(u);
    let vivo = true;
    avaliarQualidadeImagem(pendente.arquivo)
      .then((r) => vivo && setResultado(r))
      .catch(() => vivo && setErro("Não foi possível avaliar a foto. Confira a imagem antes de enviar."));
    return () => { vivo = false; URL.revokeObjectURL(u); };
  }, [pendente]);

  const [graus, setGraus] = useState(0);
  const [preparando, setPreparando] = useState(false);
  useEffect(() => { setGraus(0); }, [pendente]);

  const fechar = (f: File | null) => {
    pendente?.resolve(f);
    setPendente(null);
  };

  const enviar = async () => {
    if (!pendente) return;
    setPreparando(true);
    try {
      fechar(await girarImagem(pendente.arquivo, graus));
    } catch {
      fechar(pendente.arquivo);
    } finally {
      setPreparando(false);
    }
  };

  const ruim = resultado?.nota === "ruim";
  const dialogo = (
    <Dialog open={!!pendente} onOpenChange={(v) => { if (!v) fechar(null); }}>
      <DialogContent className="max-w-md max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ScanLine className="size-5 text-primary" /> Confira a Digitalização</DialogTitle>
          <DialogDescription>Uma foto ruim pode perder o valor de prova. Veja se a assinatura e os números estão legíveis.</DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-muted/40 grid place-items-center overflow-hidden h-56">
          {url && <img src={url} alt="Foto escolhida" className="max-h-56 max-w-full object-contain" />}
        </div>

        {!resultado && !erro && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Avaliando a qualidade da foto…</p>
        )}
        {erro && <p className="text-sm text-muted-foreground">{erro}</p>}
        {resultado && (
          <div className={cn(
            "rounded-md border p-3 text-sm space-y-2",
            resultado.nota === "boa" && "border-primary/30 bg-primary/5",
            resultado.nota === "aceitavel" && "border-accent bg-accent/30",
            ruim && "border-destructive/40 bg-destructive/5",
          )}>
            <p className="flex items-center gap-2 font-medium">
              {resultado.nota === "boa" && <><CheckCircle2 className="size-4 text-primary" /> Boa qualidade</>}
              {resultado.nota === "aceitavel" && <><AlertTriangle className="size-4" /> Aceitável, mas pode melhorar</>}
              {ruim && <><XCircle className="size-4 text-destructive" /> Qualidade ruim — recomendamos fotografar de novo</>}
            </p>
            {resultado.problemas.map((p) => (
              <div key={p.titulo}>
                <p className={cn("font-medium", p.nivel === "grave" && "text-destructive")}>{p.titulo}</p>
                <p className="text-muted-foreground">{p.dica}</p>
              </div>
            ))}
          </div>
        )}

        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium text-foreground">Como fotografar bem</summary>
          <ul className="mt-1 list-disc pl-5 space-y-0.5">{DICAS_ENQUADRAMENTO.map((d) => <li key={d}>{d}</li>)}</ul>
        </details>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant={ruim ? "default" : "outline"} onClick={() => { fechar(null); tirarOutraRef.current?.(); }}>
            Fotografar de Novo
          </Button>
          <Button
            variant={ruim ? "outline" : "default"}
            disabled={!resultado && !erro}
            onClick={() => fechar(pendente?.arquivo ?? null)}
          >
            {ruim ? "Enviar Mesmo Assim" : "Está Legível, Enviar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { conferir, dialogo };
}

/** Orientação curta exibida junto ao botão de envio. */
export function DicaEnquadramento({ className }: { className?: string }) {
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      Foto: papel inteiro com as 4 bordas, de cima, com boa luz e sem reflexo.
    </p>
  );
}
