import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RotateCcw, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import {
  useAllLegalContent,
  useUpsertLegalSection,
  useResetLegalSection,
} from "@/hooks/useLegalContent";
import { LEGAL_DEFAULTS, type LegalSection } from "@/lib/legal-defaults";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

function DocEditor<S extends LegalSection>({
  section,
  value,
  publicPath,
  extraFields,
}: {
  section: S;
  value: (typeof LEGAL_DEFAULTS)[S];
  publicPath: string;
  extraFields?: { key: keyof (typeof LEGAL_DEFAULTS)[S]; label: string }[];
}) {
  const [state, setState] = useState(value);
  useEffect(() => setState(value), [value]);
  const upsert = useUpsertLegalSection();
  const reset = useResetLegalSection();

  const update = <K extends keyof typeof state>(key: K, v: (typeof state)[K]) =>
    setState((s) => ({ ...s, [key]: v }));

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Título</Label>
          <Input
            value={(state as any).title ?? ""}
            onChange={(e) => update("title" as keyof typeof state, e.target.value as any)}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Última atualização</Label>
          <Input
            type="date"
            value={(state as any).last_updated ?? ""}
            onChange={(e) => update("last_updated" as keyof typeof state, e.target.value as any)}
          />
        </div>
      </div>

      {extraFields?.map((f) => (
        <div className="space-y-1.5" key={String(f.key)}>
          <Label className="text-xs">{f.label}</Label>
          <Input
            value={((state as any)[f.key] as string) ?? ""}
            onChange={(e) => update(f.key as keyof typeof state, e.target.value as any)}
          />
        </div>
      ))}

      <div className="space-y-1.5">
        <Label className="text-xs">Conteúdo (Markdown)</Label>
        <Textarea
          value={(state as any).body ?? ""}
          onChange={(e) => update("body" as keyof typeof state, e.target.value as any)}
          rows={24}
          className="font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">
          Suporta Markdown (títulos com #, listas com -, links [texto](url), negrito **texto**).
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
        <Button asChild variant="ghost" size="sm">
          <Link to={publicPath} target="_blank">
            <ExternalLink className="h-4 w-4 mr-1" /> Ver página pública
          </Link>
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              if (confirm("Restaurar o texto padrão deste documento?")) {
                reset.mutate(section, { onSuccess: () => setState(LEGAL_DEFAULTS[section]) });
              }
            }}
            disabled={reset.isPending}
          >
            <RotateCcw className="h-4 w-4 mr-2" /> Restaurar padrão
          </Button>
          <Button
            onClick={() => upsert.mutate({ section, content: state })}
            disabled={upsert.isPending}
          >
            Salvar
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function DocumentosLegais() {
  const { data, isLoading } = useAllLegalContent();

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <AdminPageHeader title="Documentos Legais" description="LGPD, Termos, Cookies e DPO." />
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Documentos Legais"
        description="Edite as políticas exigidas pela legislação brasileira (LGPD, CDC, Marco Civil)."
      />

      <Tabs defaultValue="privacy" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="privacy">Privacidade (LGPD)</TabsTrigger>
          <TabsTrigger value="terms">Termos de Uso</TabsTrigger>
          <TabsTrigger value="cookies">Cookies</TabsTrigger>
          <TabsTrigger value="dpo">Encarregado (DPO)</TabsTrigger>
        </TabsList>

        <TabsContent value="privacy">
          <DocEditor section="legal_privacy" value={data.legal_privacy} publicPath="/privacidade" />
        </TabsContent>
        <TabsContent value="terms">
          <DocEditor section="legal_terms" value={data.legal_terms} publicPath="/termos" />
        </TabsContent>
        <TabsContent value="cookies">
          <DocEditor section="legal_cookies" value={data.legal_cookies} publicPath="/cookies" />
        </TabsContent>
        <TabsContent value="dpo">
          <DocEditor
            section="legal_dpo"
            value={data.legal_dpo}
            publicPath="/encarregado-dados"
            extraFields={[
              { key: "controller_name", label: "Controlador — Razão social" },
              { key: "controller_cnpj", label: "Controlador — CNPJ" },
              { key: "controller_address", label: "Controlador — Endereço" },
              { key: "dpo_name", label: "DPO — Nome" },
              { key: "dpo_email", label: "DPO — E-mail" },
            ]}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
