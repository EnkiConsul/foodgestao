import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, RefreshCw, Wifi, Users, CalendarClock, Clock } from "lucide-react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useOnlineUsers } from "@/hooks/usePresence";

type CompanyLink = { id: string; name: string | null; role: string | null };

interface AdminUserRow {
  id: string;
  user_id: string;
  full_name: string | null;
  phone: string | null;
  companies?: CompanyLink[];
  auth?: {
    email: string | null;
    phone: string | null;
    last_sign_in_at: string | null;
    created_at: string | null;
  } | null;
}

type Filtro = "todos" | "online" | "inativos";

function useAdminUsers() {
  return useQuery({
    queryKey: ["admin-last-access-users"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-list-users-auth");
      if (error) throw error;
      return ((data as any)?.users ?? []) as AdminUserRow[];
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

export function AdminLastAccess() {
  const { data: users, isLoading, isFetching, refetch, dataUpdatedAt } = useAdminUsers();
  const { entries } = useOnlineUsers();
  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 20_000);
    return () => clearInterval(t);
  }, []);

  const presence = useMemo(() => {
    const map = new Map<string, "online" | "ausente">();
    for (const e of entries) {
      if (e.status === "online" || !map.has(e.user_id)) map.set(e.user_id, e.status);
    }
    return map;
  }, [entries]);

  const rows = useMemo(() => {
    const list = (users ?? []).map((u) => {
      const last = u.auth?.last_sign_in_at ? Date.parse(u.auth.last_sign_in_at) : 0;
      const status = presence.get(u.user_id);
      return {
        ...u,
        email: u.auth?.email ?? null,
        telefone: u.phone || u.auth?.phone || null,
        lastAccess: Number.isFinite(last) ? last : 0,
        status: status ?? ("offline" as const),
      };
    });
    return list.sort((a, b) => {
      const aOn = a.status !== "offline" ? 1 : 0;
      const bOn = b.status !== "offline" ? 1 : 0;
      if (aOn !== bOn) return bOn - aOn;
      return b.lastAccess - a.lastAccess;
    });
  }, [users, presence]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const limite30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return rows.filter((r) => {
      if (filtro === "online" && r.status === "offline") return false;
      if (filtro === "inativos" && r.lastAccess >= limite30) return false;
      if (!term) return true;
      const hay = [
        r.full_name ?? "",
        r.email ?? "",
        r.telefone ?? "",
        ...(r.companies ?? []).map((c) => c.name ?? ""),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(term);
    });
  }, [rows, search, filtro]);

  const hoje = new Date().setHours(0, 0, 0, 0);
  const sete = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const stats = [
    {
      label: "Online agora",
      value: rows.filter((r) => r.status !== "offline").length,
      icon: Wifi,
      tone: "text-primary",
    },
    {
      label: "Acessos hoje",
      value: rows.filter((r) => r.lastAccess >= hoje).length,
      icon: CalendarClock,
      tone: "text-foreground",
    },
    {
      label: "Últimos 7 dias",
      value: rows.filter((r) => r.lastAccess >= sete).length,
      icon: Clock,
      tone: "text-muted-foreground",
    },
    { label: "Total de usuários", value: rows.length, icon: Users, tone: "text-foreground" },
  ];

  const statusBadge = (status: "online" | "ausente" | "offline") =>
    status === "online" ? (
      <Badge variant="default">Online agora</Badge>
    ) : status === "ausente" ? (
      <Badge variant="secondary">Ausente</Badge>
    ) : (
      <Badge variant="outline">Offline</Badge>
    );

  const dataHora = (ts: number) => (ts ? format(new Date(ts), "dd/MM/yyyy HH:mm") : "Nunca acessou");
  const relativo = (ts: number, status: string) =>
    status === "online"
      ? "agora"
      : ts
        ? `há ${formatDistanceToNowStrict(new Date(ts), { locale: ptBR })}`
        : "—";

  const empresas = (list?: CompanyLink[]) =>
    !list || list.length === 0 ? (
      <span className="text-muted-foreground">—</span>
    ) : (
      <div className="flex flex-wrap gap-1">
        {list.map((c) => (
          <Badge key={c.id} variant={c.role === "owner" ? "default" : "secondary"} className="text-[10px]">
            {c.name || "Empresa"}
            <span className="ml-1 opacity-70">{c.role === "owner" ? "dono" : "convidado"}</span>
          </Badge>
        ))}
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <s.icon className={cn("h-5 w-5 shrink-0", s.tone)} />
              <div className="min-w-0">
                <p className="text-xl font-semibold leading-none">{s.value}</p>
                <p className="text-[11px] text-muted-foreground truncate">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, e-mail, telefone ou empresa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ["todos", "Todos"],
              ["online", "Online agora"],
              ["inativos", "Sem acesso há 30 dias"],
            ] as [Filtro, string][]
          ).map(([key, label]) => (
            <Button
              key={key}
              size="sm"
              variant={filtro === key ? "default" : "outline"}
              onClick={() => setFiltro(key)}
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {dataUpdatedAt
              ? `atualizado há ${formatDistanceToNowStrict(new Date(dataUpdatedAt), { locale: ptBR })}`
              : "—"}
          </span>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            <span className="ml-1.5 hidden sm:inline">Atualizar</span>
          </Button>
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden md:block rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuário</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Empresas vinculadas</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead>Último acesso</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Nenhum usuário encontrado
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.user_id}>
                  <TableCell className="font-medium">{r.full_name || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{r.email || "—"}</TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {r.telefone || "—"}
                  </TableCell>
                  <TableCell>{empresas(r.companies)}</TableCell>
                  <TableCell>{statusBadge(r.status as any)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <span>{dataHora(r.lastAccess)}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {relativo(r.lastAccess, r.status)}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile */}
      <div className="md:hidden space-y-2">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">Nenhum usuário encontrado</p>
        ) : (
          filtered.map((r) => (
            <div key={r.user_id} className="rounded-md border p-3 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium truncate">{r.full_name || "—"}</p>
                {statusBadge(r.status as any)}
              </div>
              <p className="text-xs text-muted-foreground truncate">{r.email || "—"}</p>
              <p className="text-xs text-muted-foreground">{r.telefone || "—"}</p>
              {empresas(r.companies)}
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{dataHora(r.lastAccess)}</span>
                <span>{relativo(r.lastAccess, r.status)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
