/**
 * Conferência da foto antes do envio: o candidato vê a imagem, gira se
 * precisar e só então confirma. Evita documento cortado, escuro ou deitado
 * chegando ao gestor.
 */
import { useEffect, useState } from "react";
import { FileText, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
    if (!blob) return arquivo;
    const nome = arquivo.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], nome, { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ConferirFotoDialog({
  arquivo,
  titulo,
  onConfirmar,
  onTrocar,
  onCancelar,
}: {
  arquivo: File | null;
  titulo: string;
  onConfirmar: (f: File) => void;
  onTrocar: () => void;
  onCancelar: () => void;
}) {
  const [graus, setGraus] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const [preparando, setPreparando] = useState(false);
  const imagem = !!arquivo && arquivo.type.startsWith("image/");

  useEffect(() => {
    setGraus(0);
    if (!arquivo || !arquivo.type.startsWith("image/")) { setUrl(null); return; }
    const u = URL.createObjectURL(arquivo);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [arquivo]);

  const confirmar = async () => {
    if (!arquivo) return;
    setPreparando(true);
    try {
      onConfirmar(imagem ? await girarImagem(arquivo, graus) : arquivo);
    } catch {
      onConfirmar(arquivo);
    } finally {
      setPreparando(false);
    }
  };

  return (
    <Dialog open={!!arquivo} onOpenChange={(v) => { if (!v) onCancelar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Confira Antes de Enviar</DialogTitle>
          <DialogDescription>
            {titulo}: veja se todos os números e bordas estão nítidos e a foto está em pé.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md border bg-muted/40 grid place-items-center overflow-hidden h-72">
          {imagem && url ? (
            <img
              src={url}
              alt="Foto escolhida"
              className="max-h-64 max-w-full object-contain transition-transform"
              style={{ transform: `rotate(${graus}deg)` }}
            />
          ) : (
            <div className="text-center text-sm text-muted-foreground p-4">
              <FileText className="h-8 w-8 mx-auto mb-2" />
              {arquivo?.name}
            </div>
          )}
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          {imagem && (
            <Button variant="outline" onClick={() => setGraus((g) => (g + 90) % 360)}>
              <RotateCw className="h-4 w-4 mr-2" /> Girar
            </Button>
          )}
          <Button variant="outline" onClick={onTrocar}>Escolher Outra</Button>
          <Button onClick={confirmar} disabled={preparando}>Está Nítida, Enviar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
