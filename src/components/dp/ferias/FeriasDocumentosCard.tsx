import { format, parseISO } from "date-fns";
import { FileText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DpFilePicker } from "@/components/dp/DpFilePicker";
import { useState } from "react";
import {
  useDpFeriasDocumentos, FERIAS_DOC_LABEL, type FeriasDocTipo, type FeriasDocumento,
} from "@/hooks/useDpFeriasDocumentos";
import { selosAviso, type AvisoFeriasGozo } from "@/lib/dp/ferias-aviso";

type Gozo = AvisoFeriasGozo & {
  id: string;
  colaborador_id: string;
  colaborador_nome?: string | null;
  data_fim: string;
  status?: string | null;
};

/**
 * Aviso e recibo das férias no mesmo card: o gestor registra o aviso, anexa o
 * comprovante (opcional) e o recibo emitido pela contabilidade (exigido depois
 * do início das férias). Os anexos também entram no histórico de documentos.
 */
export function FeriasDocumentosCard({
  gozo,
  onRegistrarAviso,
}: {
  gozo: Gozo;
  onRegistrarAviso: () => void;
}) {
  const { docsDoGozo, anexar, excluir, abrir } = useDpFeriasDocumentos();
  const docs = docsDoGozo(gozo.id);
  const selos = selosAviso(gozo);
  const reciboPendente = docs.recibo_ferias.length === 0 && gozo.status !== "cancelado";

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        {selos.map((s) => (
          <span key={s.chave} className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.tone}`}>
            {s.label}
          </span>
        ))}
        {gozo.aviso_em && (
          <span className="text-xs text-muted-foreground">
            Aviso em {format(parseISO(gozo.aviso_em), "dd/MM/yyyy")}
          </span>
        )}
        <Button size="sm" variant="outline" className="ml-auto" onClick={onRegistrarAviso}>
          {gozo.aviso_em ? "Reenviar aviso" : "Registrar aviso"}
        </Button>
      </div>

      {gozo.aviso_justificativa && (
        <p className="text-xs text-muted-foreground">
          Justificativa do prazo: {gozo.aviso_justificativa}
        </p>
      )}

      <Slot
        tipo="aviso_ferias"
        docs={docs.aviso_ferias}
        obrigatorio={false}
        gozo={gozo}
        onUpload={(file) =>
          anexar.mutate({
            gozoId: gozo.id,
            colaboradorId: gozo.colaborador_id,
            tipo: "aviso_ferias",
            referenciaData: gozo.aviso_em ?? gozo.data_inicio,
            file,
          })
        }
        onAbrir={abrir}
        onExcluir={(d) => excluir.mutate(d)}
      />
      <Slot
        tipo="recibo_ferias"
        docs={docs.recibo_ferias}
        obrigatorio={reciboPendente}
        gozo={gozo}
        onUpload={(file) =>
          anexar.mutate({
            gozoId: gozo.id,
            colaboradorId: gozo.colaborador_id,
            tipo: "recibo_ferias",
            referenciaData: gozo.data_inicio,
            file,
          })
        }
        onAbrir={abrir}
        onExcluir={(d) => excluir.mutate(d)}
      />
    </div>
  );
}

function Slot({
  tipo, docs, obrigatorio, onUpload, onAbrir, onExcluir,
}: {
  tipo: FeriasDocTipo;
  docs: FeriasDocumento[];
  obrigatorio: boolean;
  gozo: Gozo;
  onUpload: (file: File) => void;
  onAbrir: (doc: FeriasDocumento) => void;
  onExcluir: (doc: FeriasDocumento) => void;
}) {
  const [file, setFile] = useState<File | null>(null);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium">{FERIAS_DOC_LABEL[tipo]}</p>
        {obrigatorio && docs.length === 0 && (
          <Badge variant="outline" className="border-destructive/50 text-destructive">
            Pendente
          </Badge>
        )}
      </div>

      {docs.map((d) => (
        <div key={d.id} className="flex items-center gap-2 rounded-lg border border-border bg-background p-2">
          <FileText className="size-4 shrink-0 text-muted-foreground" />
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left text-sm hover:underline"
            onClick={() => onAbrir(d)}
          >
            {d.file_name ?? FERIAS_DOC_LABEL[tipo]}
          </button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Excluir documento"
            onClick={() => onExcluir(d)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <DpFilePicker accept="image/*,application/pdf" file={file} onFileChange={setFile} />
        <Button
          size="sm"
          disabled={!file}
          onClick={() => {
            if (!file) return;
            onUpload(file);
            setFile(null);
          }}
        >
          Anexar
        </Button>
      </div>
    </div>
  );
}
