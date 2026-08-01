import { Helmet } from "react-helmet-async";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RefreshCw, Database, Activity, AlertTriangle, Plug } from "lucide-react";
import { formatBytes, useSystemHealth } from "@/hooks/useSystemHealth";

type Status = "ok" | "atencao" | "critico";

function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status, { label: string; className: string }> = {
    ok: { label: "Saudável", className: "bg-success/15 text-success-strong border-success/30" },
    atencao: { label: "Atenção", className: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
    critico: { label: "Crítico", className: "bg-destructive/15 text-destructive border-destructive/30" },
  };
  const v = map[status];
  return (
    <Badge variant="outline" className={v.className}>
      {v.label}
    </Badge>
  );
}

function n(value: number | null | undefined) {
  return (value ?? 0).toLocaleString("pt-BR");
}

export default function AdminSaudeSistema() {
  const { data, isLoading, isFetching, error, refetch } = useSystemHealth();

  const cacheStatus: Status = !data
    ? "ok"
    : data.database.cache_hit_ratio >= 99
      ? "ok"
      : data.database.cache_hit_ratio >= 95
        ? "atencao"
        : "critico";

  const rollbackStatus: Status = !data
    ? "ok"
    : data.database.rollback_ratio <= 2
      ? "ok"
      : data.database.rollback_ratio <= 10
        ? "atencao"
        : "critico";

  const integracaoStatus: Status = !data
    ? "ok"
    : data.integracoes.pluggy_webhooks_dead_letter > 0
      ? "critico"
      : data.integracoes.pluggy_erros > 0 || data.integracoes.pluggy_webhooks_pendentes > 20
        ? "atencao"
        : "ok";

  return (
    <div className="space-y-6">
      <Helmet>
        <title>Saúde do Sistema | 360°FOOD</title>
        <meta
          name="description"
          content="Painel técnico de saúde do sistema: banco de dados, volumes e integrações."
        />
      </Helmet>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <AdminPageHeader
          title="Saúde do Sistema"
          description="Indicadores de banco de dados, volume de dados e integrações em tempo quase real"
        />
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="p-4 text-sm text-destructive">
            Não foi possível carregar os indicadores: {(error as Error).message}
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      )}

      {data && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Tamanho do banco
                </CardTitle>
                <Database className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="text-2xl font-bold">{formatBytes(data.database.size_bytes)}</div>
                <p className="text-xs text-muted-foreground">
                  {n(data.database.connections)} conexões ativas
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Cache do banco
                </CardTitle>
                <Activity className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold">{data.database.cache_hit_ratio}%</span>
                  <StatusBadge status={cacheStatus} />
                </div>
                <Progress value={Math.min(data.database.cache_hit_ratio, 100)} className="h-1.5" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Transações revertidas
                </CardTitle>
                <AlertTriangle className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold">{data.database.rollback_ratio}%</span>
                  <StatusBadge status={rollbackStatus} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {n(data.database.rollbacks)} revertidas · {n(data.database.deadlocks)} deadlocks
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Integrações
                </CardTitle>
                <Plug className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold">{n(data.integracoes.pluggy_conexoes)}</span>
                  <StatusBadge status={integracaoStatus} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {n(data.integracoes.pluggy_erros)} com erro ·{" "}
                  {n(data.integracoes.pluggy_webhooks_pendentes)} webhooks na fila
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Volume de dados</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {[
                { label: "Usuários", value: data.volumes.usuarios },
                { label: "Perfis de acesso", value: data.volumes.empresas },
                { label: "Lançamentos", value: data.volumes.lancamentos },
                { label: "Colaboradores", value: data.volumes.colaboradores },
                { label: "Assinaturas ativas", value: data.volumes.assinaturas_ativas },
              ].map((item) => (
                <div key={item.label}>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="text-lg font-semibold">{n(item.value)}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Maiores tabelas</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tabela</TableHead>
                    <TableHead className="text-right">Tamanho</TableHead>
                    <TableHead className="text-right">Linhas</TableHead>
                    <TableHead className="text-right">Linhas mortas</TableHead>
                    <TableHead className="text-right">Scans sequenciais</TableHead>
                    <TableHead className="text-right">Scans por índice</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.tables.map((t) => {
                    const seq = t.seq_scan ?? 0;
                    const idx = t.idx_scan ?? 0;
                    const seqHeavy = seq > 1000 && seq > idx;
                    return (
                      <TableRow key={t.name}>
                        <TableCell className="font-medium whitespace-nowrap">{t.name}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {formatBytes(t.total_bytes)}
                        </TableCell>
                        <TableCell className="text-right">{n(t.live_rows)}</TableCell>
                        <TableCell className="text-right">{n(t.dead_rows)}</TableCell>
                        <TableCell
                          className={`text-right ${seqHeavy ? "text-amber-600 font-medium" : ""}`}
                        >
                          {n(seq)}
                        </TableCell>
                        <TableCell className="text-right">{n(idx)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Índices sem uso ({data.unused_indexes.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {data.unused_indexes.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground text-center">
                  Nenhum índice relevante sem uso.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Índice</TableHead>
                      <TableHead>Tabela</TableHead>
                      <TableHead className="text-right">Tamanho</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.unused_indexes.map((i) => (
                      <TableRow key={i.index}>
                        <TableCell className="font-mono text-xs">{i.index}</TableCell>
                        <TableCell>{i.table}</TableCell>
                        <TableCell className="text-right">{formatBytes(i.size_bytes)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            Atualizado em {new Date(data.generated_at).toLocaleString("pt-BR")}
          </p>
        </>
      )}
    </div>
  );
}
