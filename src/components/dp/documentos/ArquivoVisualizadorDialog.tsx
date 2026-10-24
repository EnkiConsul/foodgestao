/**
 * Visualizador dentro do app: o arquivo é baixado para a memória do aparelho
 * e exibido em tela cheia (imagem com zoom ou PDF página a página). Nada abre
 * em outra aba; o download só acontece quando a pessoa toca em "Baixar".
 */
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocumentPreview } from "@/components/dp/DocumentPreview";

export interface ArquivoCarregado { url: string; mime?: string | null; nome?: string | null }

export function baixarBlob(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function buscarBlob(url: string): Promise<Blob> {
  const r = await fetch(url);
  if (!r.ok) throw new Error("Não foi possível carregar o arquivo.");
  return await r.blob();
}

export function ArquivoVisualizadorDialog({
  carregar, titulo, onClose,
}: {
  /** Quando definido, abre o visualizador. */
  carregar: (() => Promise<ArquivoCarregado>) | null;
  titulo: string;
  onClose: () => void;
}) {
  const [estado, setEstado] = useState<{ blob: Blob; url: string; mime: string | null; nome: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setEstado(null); setErro(null);
    if (!carregar) return;
    let cancelado = false;
    let objUrl: string | null = null;
    (async () => {
      try {
        const a = await carregar();
        const blob = await buscarBlob(a.url);
        if (cancelado) return;
        objUrl = URL.createObjectURL(blob);
        setEstado({ blob, url: objUrl, mime: a.mime ?? blob.type ?? null, nome: a.nome || titulo });
      } catch (e) {
        if (!cancelado) setErro((e as Error).message);
      }
    })();
    return () => { cancelado = true; if (objUrl) window.setTimeout(() => URL.revokeObjectURL(objUrl!), 1000); };
  }, [carregar, titulo]);

  return (
    <DocumentPreview
      open={!!carregar}
      onOpenChange={(v) => { if (!v) onClose(); }}
      title={titulo}
      url={estado?.url ?? null}
      mime={estado?.mime ?? null}
      aguardando={!estado && !erro ? "Carregando o documento..." : erro}
      toolbar={estado ? (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={() => baixarBlob(estado.blob, estado.nome)}>
            <Download className="h-4 w-4 mr-2" /> Baixar
          </Button>
        </div>
      ) : null}
    />
  );
}
