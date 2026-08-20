import { useEffect, useMemo, useState } from "react";
import { Loader2, EyeOff, Eye } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { DP_ADMIN_NAV, DP_PORTAL_NAV, type DpNavSurface } from "@/config/dpNavigation";
import { useHiddenScreens } from "@/hooks/useHiddenScreens";
import { cn } from "@/lib/utils";

type SurfaceDef = { key: "dp" | "portal"; label: string; surface: DpNavSurface };

const SURFACES: SurfaceDef[] = [
  { key: "dp", label: "Pessoas 360°", surface: DP_ADMIN_NAV },
  { key: "portal", label: "Portal do Colaborador", surface: DP_PORTAL_NAV },
];

/**
 * Painel único de "telas em desenvolvimento": usado no painel admin
 * (/admin/telas) e no diálogo dentro do módulo Pessoas.
 */
export function TelasDesenvolvimentoPanel({
  className,
  footerClassName,
}: {
  className?: string;
  footerClassName?: string;
}) {
  const { enabled, marcadas, loading, saving, setEnabled, setRoutes } = useHiddenScreens();
  const [sel, setSel] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSel(new Set(marcadas));
  }, [marcadas.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = useMemo(() => {
    const atual = new Set(marcadas);
    if (atual.size !== sel.size) return true;
    for (const r of sel) if (!atual.has(r)) return true;
    return false;
  }, [marcadas, sel]);

  const toggle = (to: string) =>
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(to)) next.delete(to);
      else next.add(to);
      return next;
    });

  const toggleGroup = (routes: string[], todosMarcados: boolean) =>
    setSel((prev) => {
      const next = new Set(prev);
      routes.forEach((r) => (todosMarcados ? next.delete(r) : next.add(r)));
      return next;
    });

  const salvar = () => {
    setRoutes([...sel]);
    toast.success("Telas em desenvolvimento atualizadas");
  };

  return (
    <div className={cn("space-y-6", className)}>
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
              {enabled ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </div>
            <div>
              <p className="font-medium">Ocultar telas em desenvolvimento</p>
              <p className="text-sm text-muted-foreground">
                {enabled
                  ? `${marcadas.length} tela(s) ocultas para todos os usuários.`
                  : "Tudo visível. As marcações continuam salvas."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <Switch
              checked={enabled}
              disabled={loading || saving}
              onCheckedChange={(v) => setEnabled(v)}
              aria-label="Ocultar telas em desenvolvimento"
            />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="dp">
        <TabsList>
          {SURFACES.map((s) => (
            <TabsTrigger key={s.key} value={s.key}>
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {SURFACES.map(({ key, surface }) => (
          <TabsContent key={key} value={key} className="space-y-4 pt-4">
            {surface.direct.length > 0 && (
              <GrupoCard
                titulo="Itens diretos"
                itens={surface.direct.map((i) => ({ label: i.label, to: i.to }))}
                sel={sel}
                onToggle={toggle}
                onToggleGroup={toggleGroup}
              />
            )}
            {surface.groups.map((g) => (
              <GrupoCard
                key={g.id}
                titulo={g.label}
                itens={g.items.map((i) => ({ label: i.label, to: i.to }))}
                sel={sel}
                onToggle={toggle}
                onToggleGroup={toggleGroup}
              />
            ))}
          </TabsContent>
        ))}
      </Tabs>

      <div className={cn("sticky bottom-4 flex justify-end", footerClassName)}>
        <Button onClick={salvar} disabled={!dirty || saving || loading}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar marcações
        </Button>
      </div>
    </div>
  );
}

function GrupoCard({
  titulo,
  itens,
  sel,
  onToggle,
  onToggleGroup,
}: {
  titulo: string;
  itens: { label: string; to: string }[];
  sel: Set<string>;
  onToggle: (to: string) => void;
  onToggleGroup: (routes: string[], todosMarcados: boolean) => void;
}) {
  const routes = itens.map((i) => i.to);
  const ocultas = routes.filter((r) => sel.has(r)).length;
  const todos = ocultas === routes.length && routes.length > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 py-4">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">{titulo}</CardTitle>
          <Badge variant={todos ? "destructive" : "secondary"} className="text-[10px]">
            {ocultas} de {routes.length} ocultas
          </Badge>
          {todos && (
            <span className="text-xs text-muted-foreground">o menu inteiro fica oculto</span>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={() => onToggleGroup(routes, todos)}>
          {todos ? "Reexibir grupo" : "Ocultar grupo"}
        </Button>
      </CardHeader>
      <CardContent className="grid gap-2 pb-4 sm:grid-cols-2">
        {itens.map((i) => (
          <label
            key={i.to}
            className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm hover:bg-muted/50"
          >
            <Checkbox checked={sel.has(i.to)} onCheckedChange={() => onToggle(i.to)} />
            <span className="flex-1">{i.label}</span>
            <code className="text-[10px] text-muted-foreground">{i.to}</code>
          </label>
        ))}
      </CardContent>
    </Card>
  );
}
