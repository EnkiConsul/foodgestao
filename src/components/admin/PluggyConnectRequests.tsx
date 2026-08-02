import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { RefreshCw } from "lucide-react";
import { parseEdgeFunctionError } from "@/lib/edgeFunctionError";

type RequestRow = {
  id: string;
  company_id: string;
  user_id: string;
  item_id_to_update: string | null;
  resolved_item_id: string | null;
  status: string;
  expires_at: string;
  created_at: string;
  last_error: string | null;
};

function fmt(value?: string | null) {
  if (!value) return "—";
  try {
    return format(new Date(value), "dd/MM HH:mm", { locale: ptBR });
  } catch {
    return "—";
  }
}

type PluggyItem = {
  item_id: string;
  connector_name: string | null;
  status: string | null;
  execution_status: string | null;
  client_user_id: string | null;
  created_at: string | null;
  linked: boolean;
  linked_company_id: string | null;
  unavailable?: boolean;
  http_status?: number;
  error?: string | null;
};

export function PluggyConnectRequests() {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [itemIds, setItemIds] = useState<Record<string, string>>({});
  const [finishing, setFinishing] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [searching, setSearching] = useState(false);
  const [items, setItems] = useState<PluggyItem[] | null>(null);
  const [manualCompanyId, setManualCompanyId] = useState("");
  const [manualItemId, setManualItemId] = useState("");
  const [linking, setLinking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("pluggy_connect_requests")
      .select(
        "id, company_id, user_id, item_id_to_update, resolved_item_id, status, expires_at, created_at, last_error",
      )
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) toast.error("Falha ao carregar solicitações de conexão");
    setRows((data as RequestRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const findItems = useCallback(async () => {
    setSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke("pluggy-admin-find-items", {
        body: email.trim() ? { email: email.trim() } : {},
      });
      if (error) throw error;
      setItems((data?.items ?? []) as PluggyItem[]);
      if (!data?.items?.length) toast.info("Nenhum item encontrado na Pluggy para esse filtro");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Falha ao consultar itens na Pluggy");
    } finally {
      setSearching(false);
    }
  }, [email]);

  const linkManually = useCallback(async () => {
    const itemId = manualItemId.trim();
    const companyId = manualCompanyId.trim();
    if (!itemId || !companyId) {
      toast.error("Informe o item_id da Pluggy e o ID da empresa");
      return;
    }
    setLinking(true);
    try {
      const { data, error } = await supabase.functions.invoke("pluggy-sync-item", {
        body: { item_id: itemId, company_id: companyId, first_connect: true },
      });
      if (error) throw error;
      toast.success(`Item vinculado: ${data?.transactions ?? 0} lançamentos importados`);
      setManualItemId("");
      await load();
      await findItems();
    } catch (e: unknown) {
      console.error(e);
      const info = await parseEdgeFunctionError(e, "Falha ao vincular o item");
      toast.error(info.message);
    } finally {
      setLinking(false);
    }
  }, [manualItemId, manualCompanyId, load, findItems]);


  const finish = useCallback(
    async (row: RequestRow) => {
      const itemId = (itemIds[row.id] ?? row.resolved_item_id ?? "").trim();
      if (!itemId) {
        toast.error("Informe o item_id da Pluggy para concluir");
        return;
      }
      setFinishing(row.id);
      try {
        const { data, error } = await supabase.functions.invoke("pluggy-sync-item", {
          body: { item_id: itemId, company_id: row.company_id, first_connect: true },
        });
        if (error) throw error;
        toast.success(`Conexão concluída: ${data?.transactions ?? 0} lançamentos importados`);
        await load();
      } catch (e: unknown) {
        console.error(e);
        const info = await parseEdgeFunctionError(e, "Falha ao concluir a conexão");
        toast.error(info.message);
      } finally {
        setFinishing(null);
      }
    },
    [itemIds, load],
  );

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">Solicitações de conexão (Open Finance)</p>
            <p className="text-xs text-muted-foreground">
              Use para concluir manualmente conexões em que o banco autorizou pelo app
              (QR Code) e o navegador não retornou.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>

        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma solicitação registrada.</p>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-1.5 pr-3">Criada</th>
                  <th className="py-1.5 pr-3">Status</th>
                  <th className="py-1.5 pr-3">Expira</th>
                  <th className="py-1.5 pr-3">Item</th>
                  <th className="py-1.5">Concluir</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="py-1.5 pr-3 whitespace-nowrap">{fmt(r.created_at)}</td>
                    <td className="py-1.5 pr-3">
                      <Badge variant={r.status === "completed" ? "default" : r.status === "open" ? "secondary" : "outline"}>
                        {r.status}
                      </Badge>
                    </td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">{fmt(r.expires_at)}</td>
                    <td className="py-1.5 pr-3 font-mono">
                      {(r.resolved_item_id ?? r.item_id_to_update ?? "—").slice(0, 8)}
                    </td>
                    <td className="py-1.5">
                      {r.status === "completed" ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Input
                            className="h-7 w-56 text-xs"
                            placeholder="item_id da Pluggy"
                            aria-label="item_id da Pluggy"
                            value={itemIds[r.id] ?? r.resolved_item_id ?? ""}
                            onChange={(e) =>
                              setItemIds((prev) => ({ ...prev, [r.id]: e.target.value }))
                            }
                          />
                          <Button
                            size="sm"
                            className="h-7"
                            onClick={() => finish(r)}
                            disabled={finishing === r.id}
                          >
                            {finishing === r.id ? "Concluindo…" : "Concluir"}
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="border-t pt-3 space-y-3">
          <div>
            <p className="text-sm font-semibold">Itens na Pluggy (diagnóstico)</p>
            <p className="text-xs text-muted-foreground">
              Consulta os itens existentes na Pluggy e mostra quais ainda não foram
              materializados na plataforma. Filtre pelo e-mail do cliente.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="h-8 w-64 text-xs"
              placeholder="e-mail do cliente (opcional)"
              aria-label="E-mail do cliente"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button size="sm" variant="outline" className="h-8" onClick={findItems} disabled={searching}>
              {searching ? "Consultando…" : "Consultar Pluggy"}
            </Button>
          </div>

          {items && items.length > 0 && (
            <div className="overflow-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-1.5 pr-3">Criado</th>
                    <th className="py-1.5 pr-3">Banco</th>
                    <th className="py-1.5 pr-3">Status</th>
                    <th className="py-1.5 pr-3">item_id</th>
                    <th className="py-1.5">Vinculado</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.item_id} className="border-t">
                      <td className="py-1.5 pr-3 whitespace-nowrap">{fmt(it.created_at)}</td>
                      <td className="py-1.5 pr-3">{it.connector_name ?? (it.unavailable ? "Item antigo" : "—")}</td>
                      <td className="py-1.5 pr-3">
                        {it.unavailable ? (
                          <Badge variant="destructive">Inexistente em produção</Badge>
                        ) : (it.status ?? "—")}
                      </td>
                      <td className="py-1.5 pr-3 font-mono">
                        {it.unavailable ? (
                          <span className="text-muted-foreground line-through">{it.item_id.slice(0, 8)}</span>
                        ) : (
                          <Button
                            type="button"
                            variant="link"
                            size="sm"
                            className="h-auto p-0 font-mono text-xs"
                            onClick={() => setManualItemId(it.item_id)}
                          >
                            {it.item_id.slice(0, 8)}
                          </Button>
                        )}
                      </td>
                      <td className="py-1.5">
                        {it.unavailable ? (
                          <span className="text-muted-foreground">Reconecte</span>
                        ) : it.linked ? (
                          <Badge variant="default">Sim</Badge>
                        ) : (
                          <Badge variant="outline">Não</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="space-y-1.5">
            <p className="text-xs font-medium">Vincular item manualmente</p>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="h-8 w-72 text-xs font-mono"
                placeholder="item_id da Pluggy"
                aria-label="item_id da Pluggy para vincular"
                value={manualItemId}
                onChange={(e) => setManualItemId(e.target.value)}
              />
              <Input
                className="h-8 w-72 text-xs font-mono"
                placeholder="ID da empresa (company_id)"
                aria-label="ID da empresa"
                value={manualCompanyId}
                onChange={(e) => setManualCompanyId(e.target.value)}
              />
              <Button size="sm" className="h-8" onClick={linkManually} disabled={linking}>
                {linking ? "Vinculando…" : "Vincular"}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

  );
}
