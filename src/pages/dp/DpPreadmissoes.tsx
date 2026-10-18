/**
 * Pré-Admissões: acompanhamento das fichas preenchidas pelos candidatos.
 *
 * A lista em si vive em PreadmissoesPanel, reaproveitada também na aba
 * "Pré-Admissão" da tela de Colaboradores.
 */
import { useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { UserPlus, UserSquare2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { PreadmissoesPanel } from "@/components/dp/preadmissao/PreadmissoesPanel";
import type { ConviteInicial } from "@/components/dp/preadmissao/PreadmissaoConviteDialog";

export default function DpPreadmissoes() {
  // Chegando por "Enviar Link de Pré-Admissão" na tela de Colaboradores, o
  // convite já abre na frente (não existe entrada própria no menu).
  const [params, setParams] = useSearchParams();
  const [convidando, setConvidando] = useState(params.get("novo") === "1");
  // Promoção de folguista: os dados já cadastrados chegam junto da navegação.
  const { state } = useLocation() as { state?: { conviteInicial?: ConviteInicial } | null };
  const conviteInicial = state?.conviteInicial ?? null;

  return (
    <DpPage>
      <DpPageHeader
        icon={UserSquare2}
        title="Pré-Admissões"
        className="[&_.dp-page-actions]:hidden [&_.dp-page-actions]:md:flex"
        actions={
          <Button onClick={() => setConvidando(true)}>
            <UserPlus className="h-4 w-4 mr-2" /> Convidar Candidato
          </Button>
        }
      />

      <PreadmissoesPanel
        conviteInicial={conviteInicial}
        convidarAberto={convidando}
        onConvidarChange={(v) => {
          setConvidando(v);
          if (!v && params.get("novo")) {
            params.delete("novo");
            setParams(params, { replace: true });
          }
        }}
      />
      <Button size="icon" className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-40 h-14 w-14 rounded-full shadow-lg md:hidden" onClick={() => setConvidando(true)} aria-label="Convidar candidato" title="Convidar candidato"><UserPlus className="h-6 w-6" /></Button>
    </DpPage>
  );
}
