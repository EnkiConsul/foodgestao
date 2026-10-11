/**
 * Foto 3x4 do colaborador: lida do item "Foto 3x4" do checklist de documentos
 * (enviado na ficha, no portal ou na pré-admissão). Sem foto válida, mostra as
 * iniciais — nunca cria pendência.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const CODIGOS_FOTO = ["foto_cadastro", "foto_3x4"];

function iniciais(nome?: string | null) {
  const p = (nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return ((p[0][0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

export function useFotoColaborador(colaboradorId?: string | null) {
  return useQuery({
    queryKey: ["dp_foto_colaborador", colaboradorId],
    enabled: !!colaboradorId,
    staleTime: 4 * 60 * 1000,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from("dp_colaborador_documentos")
        .select("updated_at, dp_documento_requisitos!inner(codigo), dp_documentos(file_path, mime_type, aprovacao_status, arquivado_em, created_at)")
        .eq("colaborador_id", colaboradorId!)
        .in("dp_documento_requisitos.codigo", CODIGOS_FOTO)
        .is("dependente_id", null);
      if (error) {
        // Foto indisponível (permissão/consulta): registra internamente, mostra iniciais.
        console.warn("[FotoColaborador] foto indisponível", error.message);
        return null;
      }
      const docs = (data ?? [])
        .map((r: any) => r.dp_documentos)
        .filter((d: any) => d?.file_path && String(d.mime_type ?? "").startsWith("image/")
          && d.aprovacao_status !== "recusado" && !d.arquivado_em)
        .sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)));
      const path = docs[0]?.file_path;
      if (!path) return null;
      const { data: s, error: e2 } = await supabase.storage.from("dp-documentos").createSignedUrl(path, 300);
      if (e2) console.warn("[FotoColaborador] arquivo da foto indisponível", e2.message);
      return s?.signedUrl ?? null;
    },
  });
}

export function FotoColaborador({
  colaboradorId,
  nome,
  className,
}: {
  colaboradorId?: string | null;
  nome?: string | null;
  className?: string;
}) {
  const { data: url } = useFotoColaborador(colaboradorId);
  return (
    <div
      className={cn(
        "shrink-0 overflow-hidden rounded-md border border-border bg-muted grid place-items-center aspect-[3/4] w-14",
        className,
      )}
    >
      {url ? (
        <img src={url} alt={`Foto de ${nome ?? "colaborador"}`} className="h-full w-full object-cover" />
      ) : (
        <span className="text-base font-semibold text-muted-foreground">{iniciais(nome)}</span>
      )}
    </div>
  );
}
