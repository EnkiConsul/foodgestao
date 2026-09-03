import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RefreshCw, ExternalLink, Search, CheckCircle2, AlertTriangle, XCircle, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

interface UrlResult {
  url: string;
  ok: boolean;
  error?: string;
  verdict?: string;
  coverageState?: string;
  robotsTxtState?: string;
  indexingState?: string;
  lastCrawlTime?: string | null;
  googleCanonical?: string | null;
  userCanonical?: string | null;
  pageFetchState?: string;
  crawledAs?: string;
}

interface InspectResponse {
  siteUrl: string;
  fetchedAt: string;
  results: UrlResult[];
}

const SITE_URL = "https://aveto360.com/";
const MONITORED_URLS = [
  "https://aveto360.com/",
  "https://aveto360.com/guias/das-mei",
];

function formatDateTime(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}

function relativeFromNow(iso?: string | null) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return null;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "agora";
  const min = Math.floor(sec / 60);
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d}d`;
  const m = Math.floor(d / 30);
  if (m < 12) return `há ${m} meses`;
  return `há ${Math.floor(m / 12)}a`;
}

function VerdictBadge({ verdict }: { verdict?: string }) {
  if (!verdict) return <Badge variant="outline">—</Badge>;
  const map: Record<string, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
    PASS: { label: "Indexada", cls: "bg-emerald-500/10 text-emerald-700 border-emerald-300", Icon: CheckCircle2 },
    PARTIAL: { label: "Parcial", cls: "bg-amber-500/10 text-amber-700 border-amber-300", Icon: AlertTriangle },
    FAIL: { label: "Falha", cls: "bg-red-500/10 text-red-700 border-red-300", Icon: XCircle },
    NEUTRAL: { label: "Neutro", cls: "bg-muted text-muted-foreground border-border", Icon: Circle },
    VERDICT_UNSPECIFIED: { label: "—", cls: "bg-muted text-muted-foreground border-border", Icon: Circle },
  };
  const v = map[verdict] ?? { label: verdict, cls: "bg-muted text-muted-foreground border-border", Icon: Circle };
  const I = v.Icon;
  return (
    <Badge variant="outline" className={`gap-1 ${v.cls}`}>
      <I className="h-3 w-3" />
      {v.label}
    </Badge>
  );
}

export default function SeoIndexacao() {
  const [data, setData] = useState<InspectResponse | null>(null);

  const inspect = useMutation({
    mutationFn: async (urls: string[]): Promise<InspectResponse> => {
      const { data, error } = await supabase.functions.invoke("inspect-search-console", {
        body: { urls, siteUrl: SITE_URL },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      return data as InspectResponse;
    },
    onSuccess: (res) => {
      setData((prev) => {
        if (!prev) return res;
        // merge results by URL
        const byUrl = new Map<string, UrlResult>();
        for (const r of prev.results) byUrl.set(r.url, r);
        for (const r of res.results) byUrl.set(r.url, r);
        return { ...res, results: Array.from(byUrl.values()) };
      });
      toast.success("Consulta atualizada");
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao consultar Search Console"),
  });

  const refreshAll = () => inspect.mutate(MONITORED_URLS);
  const refreshOne = (url: string) => inspect.mutate([url]);

  const results = data?.results ?? [];
  const orderedResults = MONITORED_URLS.map(
    (u) => results.find((r) => r.url === u) ?? null,
  );

  const gscUrl = (u: string) =>
    `https://search.google.com/search-console/inspect?resource_id=${encodeURIComponent(
      SITE_URL,
    )}&id=${encodeURIComponent(u)}`;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <AdminPageHeader
          title="Indexação SEO"
          description="Status de indexação e último crawl das URLs principais no Google Search Console."
        />
        <Button onClick={refreshAll} disabled={inspect.isPending}>
          <RefreshCw className={`h-4 w-4 mr-2 ${inspect.isPending ? "animate-spin" : ""}`} />
          Atualizar todas
        </Button>
      </div>

      {data && (
        <p className="text-xs text-muted-foreground">
          Última consulta: {formatDateTime(data.fetchedAt)} ({relativeFromNow(data.fetchedAt)})
        </p>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">URL</th>
                  <th className="px-4 py-3 font-medium">Verdict</th>
                  <th className="px-4 py-3 font-medium">Cobertura</th>
                  <th className="px-4 py-3 font-medium">Último crawl</th>
                  <th className="px-4 py-3 font-medium">Robots</th>
                  <th className="px-4 py-3 font-medium">Canonical</th>
                  <th className="px-4 py-3 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {orderedResults.map((r, idx) => {
                  const url = MONITORED_URLS[idx];
                  return (
                    <tr key={url} className="border-t">
                      <td className="px-4 py-3">
                        <div className="font-mono text-xs break-all">{url}</div>
                        {r?.error && (
                          <div className="text-xs text-red-600 mt-1">{r.error}</div>
                        )}
                      </td>
                      <td className="px-4 py-3"><VerdictBadge verdict={r?.verdict} /></td>
                      <td className="px-4 py-3 text-xs">{r?.coverageState ?? "—"}</td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        {r?.lastCrawlTime ? (
                          <>
                            <div>{formatDateTime(r.lastCrawlTime)}</div>
                            <div className="text-muted-foreground">{relativeFromNow(r.lastCrawlTime)}</div>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">{r?.robotsTxtState ?? "—"}</td>
                      <td className="px-4 py-3 text-xs">
                        {r ? (
                          <div className="space-y-0.5">
                            <div><span className="text-muted-foreground">Google:</span> {r.googleCanonical ?? "—"}</div>
                            <div><span className="text-muted-foreground">Declarado:</span> {r.userCanonical ?? "—"}</div>
                          </div>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => refreshOne(url)}
                          disabled={inspect.isPending}
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${inspect.isPending ? "animate-spin" : ""}`} />
                        </Button>
                        <Button size="sm" variant="ghost" asChild>
                          <a href={gscUrl(url)} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {!data && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                      <Search className="h-6 w-6 mx-auto mb-2 opacity-50" />
                      Clique em "Atualizar todas" para consultar o Search Console.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Dados retornados pela API URL Inspection do Google Search Console em tempo real. As cotas do Google
        limitam a 2.000 consultas por dia e 600 por minuto.
      </p>
    </div>
  );
}
