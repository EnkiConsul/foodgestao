import { useEffect, useState } from "react";
import { ouvirVisualizacao } from "@/lib/visualizadorGlobal";
import { ArquivoVisualizadorDialog, type ArquivoCarregado } from "./ArquivoVisualizadorDialog";

/** Visualizador único do app: qualquer tela pede via `abrirNoApp`. */
export function VisualizadorGlobalHost() {
  const [pedido, setPedido] = useState<{ titulo: string; carregar: () => Promise<ArquivoCarregado> } | null>(null);
  useEffect(() => ouvirVisualizacao((p) => {
    const titulo = p.titulo || p.nome || "Documento";
    const carregar = p.carregar ?? (async () => ({ url: p.url!, mime: p.mime ?? null, nome: p.nome ?? titulo }));
    setPedido({ titulo, carregar });
  }), []);
  return <ArquivoVisualizadorDialog carregar={pedido?.carregar ?? null} titulo={pedido?.titulo ?? ""} onClose={() => setPedido(null)} />;
}
