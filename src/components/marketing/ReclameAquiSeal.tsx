import { useEffect, useRef } from "react";
import { isHomologacao } from "@/lib/env/appEnv";

const SRC = "https://s3.amazonaws.com/raichu-beta/ra-verified/bundle.js";
const DATA_ID = "S3VsSmgwLTk3X1Jkalc3VDpyYXB0b3Itc3lzdGVt";
const TARGET = "ra-verified-seal";

/**
 * Selo verificado do Reclame Aqui (modelo compacto).
 *
 * O bundle oficial só funciona injetado como <script> em um contêiner com o id
 * esperado. Falha de rede ou bloqueador de anúncios não gera erro: o contêiner
 * fica vazio e o layout segue igual.
 *
 * Não carrega em homologação — nenhum script de terceiro sobe naquele ambiente.
 */
export function ReclameAquiSeal({ className }: { className?: string }) {
  const container = useRef<HTMLDivElement | null>(null);
  const injetado = useRef(false);

  useEffect(() => {
    if (isHomologacao()) return;
    const alvo = container.current;
    if (!alvo || injetado.current) return;
    if (document.getElementById("ra-embed-verified-seal")) return;

    injetado.current = true;
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.id = "ra-embed-verified-seal";
    script.src = SRC;
    script.async = true;
    script.setAttribute("data-id", DATA_ID);
    script.setAttribute("data-target", TARGET);
    script.setAttribute("data-model", "compact_1");
    alvo.appendChild(script);

    return () => {
      script.remove();
      injetado.current = false;
    };
  }, []);

  if (isHomologacao()) return null;

  return <div id={TARGET} ref={container} className={className} />;
}
