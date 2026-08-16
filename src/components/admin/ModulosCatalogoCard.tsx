import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import {
  useModulosCatalogoAdmin,
  useUpdateModuloCatalogo,
} from "@/hooks/useModulosCatalogo";

/**
 * Backoffice: ativa/inativa módulos do catálogo e define onde eles aparecem
 * (Landing Page e Hub de Módulos).
 */
export function ModulosCatalogoCard() {
  const { data, isLoading } = useModulosCatalogoAdmin();
  const update = useUpdateModuloCatalogo();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Catálogo de Módulos</CardTitle>
        <CardDescription>
          Ative ou inative um módulo globalmente e escolha onde ele deve aparecer.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-2">
            {(data ?? []).map((m) => {
              const Icon = m.Icon;
              return (
                <div
                  key={m.id}
                  className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{m.nome}</span>
                        {!m.ativo && <Badge variant="outline">Inativo</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">{m.descricao_curta}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                    <label className="flex items-center gap-2 text-xs">
                      <Switch
                        checked={m.ativo}
                        onCheckedChange={(v) => update.mutate({ id: m.id, patch: { ativo: v } })}
                        aria-label={`Ativar ${m.nome}`}
                      />
                      Ativo
                    </label>
                    <label className="flex items-center gap-2 text-xs">

                      <Switch
                        checked={m.show_on_hub}
                        onCheckedChange={(v) =>
                          update.mutate({ id: m.id, patch: { show_on_hub: v } })
                        }
                        aria-label={`Exibir ${m.nome} no Hub`}
                      />
                      Hub de Módulos
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
