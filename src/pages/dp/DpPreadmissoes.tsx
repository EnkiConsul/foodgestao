/**
 * Pré-Admissões: acompanhamento das fichas preenchidas pelos candidatos.
 *
 * A lista em si vive em PreadmissoesPanel, reaproveitada também na aba
 * "Pré-Admissão" da tela de Colaboradores.
 */
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { UserPlus, UserSquare2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { PreadmissoesPanel } from "@/components/dp/preadmissao/PreadmissoesPanel";

export default function DpPreadmissoes() {
  // Chegando por "Enviar Link De Pré-Admissão" na tela de Colaboradores, o
  // convite já abre na frente (não existe entrada própria no menu).
  const [params, setParams] = useSearchParams();
  const [convidando, setConvidando] = useState(params.get("novo") === "1");

  return (
    <DpPage>
      <DpPageHeader
        icon={UserSquare2}
        title="Pré-Admissões"
        description="O candidato preenche a ficha e envia os documentos pelo celular. Você revisa, envia à contabilidade e cria o cadastro depois de conferir a ficha oficial."
        actions={
          <Button onClick={() => setConvidando(true)}>
            <UserPlus className="h-4 w-4 mr-2" /> Convidar Candidato
          </Button>
        }
      />

      <PreadmissoesPanel
        convidarAberto={convidando}
        onConvidarChange={(v) => {
          setConvidando(v);
          if (!v && params.get("novo")) {
            params.delete("novo");
            setParams(params, { replace: true });
          }
        }}
      />
    </DpPage>
  );
}
