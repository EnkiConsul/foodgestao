import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Loader2,
  RotateCw,
  ScanLine,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  avaliarQualidadeImagem,
  type ResultadoQualidade,
} from "@/lib/storage/qualidadeDigitalizacao";
import { cn } from "@/lib/utils";

export const DICAS_ENQUADRAMENTO = [
  "Papel inteiro na foto, com as 4 bordas visíveis e uma pequena margem.",
  "Celular paralelo ao papel (de cima, sem inclinar), sobre fundo escuro e liso.",
  "Boa luz, sem sombra da mão ou do celular e sem flash direto.",
  "Toque na tela sobre o texto para focar; assinatura e números precisam estar legíveis.",
];

async function girarImagem(arquivo: File, graus: number): Promise<File> {
  const g = ((graus % 360) + 360) % 360;
  if (g === 0) return arquivo;
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Não foi possível ler a foto."));
      i.src = url;
    });
    const deitado = g === 90 || g === 270;
    const canvas = document.createElement("canvas");
    canvas.width = deitado ? img.naturalHeight : img.naturalWidth;
    canvas.height = deitado ? img.naturalWidth : img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return arquivo;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((g * Math.PI) / 180);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    const blob = await new Promise<Blob | null>((r) =>
      canvas.toBlob(r, "image/jpeg", 0.92),
    );
    if (!blob) return arquivo;
    return new File([blob], arquivo.name.replace(/\.[^.]+$/, "") + ".jpg", {
      type: "image/jpeg",
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

type Pendente = { arquivo: File; soNitidez: boolean; resolve: (f: File | null) => void };

export type ModoSelecao = "camera" | "arquivo";

/** Abre o seletor nativo: com câmera traseira ("Tirar Foto") ou galeria/arquivos. */
export function acionarInput(el: HTMLInputElement | null, modo: ModoSelecao) {
  if (!el) return;
  if (modo === "camera") el.setAttribute("capture", "environment");
  else el.removeAttribute("capture");
  el.click();
}

/**
 * Indica se a imagem tem marca de câmera (EXIF com fabricante/modelo).
 * Prints, comprovantes baixados do banco e PDFs convertidos não têm.
 */
export async function temMarcaDeCamera(arquivo: File): Promise<boolean> {
  try {
    if (!/jpe?g/i.test(arquivo.type)) return false;
    const buf = new DataView(await arquivo.slice(0, 131072).arrayBuffer());
    if (buf.getUint16(0) !== 0xffd8) return false;
    let off = 2;
    while (off + 4 < buf.byteLength) {
      const marker = buf.getUint16(off);
      const len = buf.getUint16(off + 2);
      if (marker === 0xffe1 && buf.getUint32(off + 4) === 0x45786966) {
        const tiff = off + 10;
        const le = buf.getUint16(tiff) === 0x4949;
        const ifd = tiff + buf.getUint32(tiff + 4, le);
        const n = buf.getUint16(ifd, le);
        for (let i = 0; i < n; i++) {
          const tag = buf.getUint16(ifd + 2 + i * 12, le);
          if (tag === 0x010f || tag === 0x0110) return true;
        }
        return false;
      }
      if ((marker & 0xff00) !== 0xff00) return false;
      off += 2 + len;
    }
  } catch {
    /* sem metadado legível */
  }
  return false;
}

/** Arquivo digital sem marca de câmera: só a nitidez importa. */
function filtrarSoNitidez(r: ResultadoQualidade): ResultadoQualidade {
  const problemas = r.problemas.filter((p) => /nitidez|tremida|desfocada/i.test(p.titulo));
  const graves = problemas.filter((p) => p.nivel === "grave").length;
  return { ...r, problemas, nota: graves ? "ruim" : problemas.length ? "aceitavel" : "boa" };
}

/**
 * Antes de enviar uma foto de documento, mostra a imagem, as orientações de
 * enquadramento e o resultado da avaliação de qualidade. PDFs passam direto.
 *
 * Uso: `const { conferir, dialogo } = useConferenciaDigitalizacao();`
 * `const final = await conferir(arquivo); if (!final) return;` e renderize `{dialogo}`.
 */
export function useConferenciaDigitalizacao(opcoes?: {
  onTirarOutra?: () => void;
  onSelecionarArquivo?: (modo: ModoSelecao) => void;
}) {
  const modoRef = useRef<ModoSelecao>("arquivo");
  const [pendente, setPendente] = useState<Pendente | null>(null);
  const [orientacaoAberta, setOrientacaoAberta] = useState(false);
  const [resultado, setResultado] = useState<ResultadoQualidade | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const tirarOutraRef = useRef(opcoes?.onTirarOutra);
  tirarOutraRef.current = opcoes?.onTirarOutra;
  const selecionarArquivoRef = useRef(opcoes?.onSelecionarArquivo);
  selecionarArquivoRef.current = opcoes?.onSelecionarArquivo;

  const abrirSeletor = useCallback(() => setOrientacaoAberta(true), []);

  const conferir = useCallback((arquivo: File): Promise<File | null> => {
    if (!arquivo.type.startsWith("image/") || /heic|heif/i.test(arquivo.type)) {
      return Promise.resolve(arquivo);
    }
    const camera = modoRef.current === "camera";
    return (async () => {
      const soNitidez = !camera && !(await temMarcaDeCamera(arquivo));
      if (soNitidez) {
        // Arquivo digital (print, comprovante do banco): passa direto se nítido.
        try {
          const r = filtrarSoNitidez(await avaliarQualidadeImagem(arquivo));
          if (r.problemas.length === 0) return arquivo;
        } catch {
          return arquivo;
        }
      }
      return new Promise<File | null>((resolve) =>
        setPendente({ arquivo, soNitidez, resolve }),
      );
    })();
  }, []);

  useEffect(() => {
    setResultado(null);
    setErro(null);
    if (!pendente) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(pendente.arquivo);
    setUrl(u);
    let vivo = true;
    avaliarQualidadeImagem(pendente.arquivo)
      .then((r) => vivo && setResultado(pendente.soNitidez ? filtrarSoNitidez(r) : r))
      .catch(
        () =>
          vivo &&
          setErro(
            "Não foi possível avaliar a foto. Confira a imagem antes de enviar.",
          ),
      );
    return () => {
      vivo = false;
      URL.revokeObjectURL(u);
    };
  }, [pendente]);

  const [graus, setGraus] = useState(0);
  const [preparando, setPreparando] = useState(false);
  useEffect(() => {
    setGraus(0);
  }, [pendente]);

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
    <>
      <Dialog open={orientacaoAberta} onOpenChange={setOrientacaoAberta}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="size-5 text-primary" /> Antes de Fotografar
            </DialogTitle>
            <DialogDescription>
              Prepare o documento para que a foto fique completa e legível.
            </DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            {DICAS_ENQUADRAMENTO.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setOrientacaoAberta(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setOrientacaoAberta(false);
                modoRef.current = "arquivo";
                selecionarArquivoRef.current?.("arquivo");
              }}
            >
              Selecionar Arquivo
            </Button>
            <Button
              onClick={() => {
                setOrientacaoAberta(false);
                modoRef.current = "camera";
                selecionarArquivoRef.current?.("camera");
              }}
            >
              <Camera className="mr-2 size-4" /> Tirar Foto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!pendente}
        onOpenChange={(v) => {
          if (!v) fechar(null);
        }}
      >
        <DialogContent className="max-w-md max-h-[92dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanLine className="size-5 text-primary" /> Confira a
              Digitalização
            </DialogTitle>
            <DialogDescription>
              Uma foto ruim pode perder o valor de prova. Veja se a assinatura e
              os números estão legíveis.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border bg-muted/40 grid place-items-center overflow-hidden h-56">
            {url && (
              <img
                src={url}
                alt="Foto escolhida"
                className="max-h-56 max-w-full object-contain transition-transform"
                style={{ transform: `rotate(${graus}deg)` }}
              />
            )}
          </div>

          {!resultado && !erro && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Avaliando a qualidade
              da foto…
            </p>
          )}
          {erro && <p className="text-sm text-muted-foreground">{erro}</p>}
          {resultado && (
            <div
              className={cn(
                "rounded-md border p-3 text-sm space-y-2",
                resultado.nota === "boa" && "border-primary/30 bg-primary/5",
                resultado.nota === "aceitavel" && "border-accent bg-accent/30",
                ruim && "border-destructive/40 bg-destructive/5",
              )}
            >
              <p className="flex items-center gap-2 font-medium">
                {resultado.nota === "boa" && (
                  <>
                    <CheckCircle2 className="size-4 text-primary" /> Boa
                    qualidade
                  </>
                )}
                {resultado.nota === "aceitavel" && (
                  <>
                    <AlertTriangle className="size-4" /> Aceitável, mas pode
                    melhorar
                  </>
                )}
                {ruim && (
                  <>
                    <XCircle className="size-4 text-destructive" /> Qualidade
                    ruim — recomendamos fotografar de novo
                  </>
                )}
              </p>
              {resultado.problemas.map((p) => (
                <div key={p.titulo}>
                  <p
                    className={cn(
                      "font-medium",
                      p.nivel === "grave" && "text-destructive",
                    )}
                  >
                    {p.titulo}
                  </p>
                  <p className="text-muted-foreground">{p.dica}</p>
                </div>
              ))}
            </div>
          )}

          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground">
              Como fotografar bem
            </summary>
            <ul className="mt-1 list-disc pl-5 space-y-0.5">
              {DICAS_ENQUADRAMENTO.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </details>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant={ruim ? "default" : "outline"}
              onClick={() => {
                fechar(null);
                modoRef.current = "camera";
                tirarOutraRef.current?.();
              }}
            >
              Fotografar de Novo
            </Button>
            <Button
              variant="outline"
              onClick={() => setGraus((g) => (g + 90) % 360)}
            >
              <RotateCw className="mr-2 size-4" /> Girar
            </Button>
            <Button
              variant={ruim ? "outline" : "default"}
              disabled={(!resultado && !erro) || preparando}
              onClick={() => void enviar()}
            >
              {ruim ? "Enviar Mesmo Assim" : "Está Legível, Enviar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  return { abrirSeletor, conferir, dialogo };
}

/** Orientação curta exibida junto ao botão de envio. */
export function DicaEnquadramento({ className }: { className?: string }) {
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      Foto: papel inteiro com as 4 bordas, de cima, com boa luz e sem reflexo.
    </p>
  );
}
