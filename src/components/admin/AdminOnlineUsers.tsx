import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Wifi, WifiOff, Users, Clock } from "lucide-react";
import { formatDistanceToNowStrict, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useOnlineUsers, type PresenceEntry } from "@/hooks/usePresence";
import { useUserNames } from "@/hooks/useUserNames";

interface OnlineUser {
  user_id: string;
  name: string;
  email: string | null;
  status: "online" | "ausente";
  route: string;
  sessions: number;
  lastActivity: number;
  since: number;
}

function groupByUser(entries: PresenceEntry[]): OnlineUser[] {
  const map = new Map<string, OnlineUser>();
  for (const e of entries) {
    const last = Date.parse(e.last_activity) || 0;
    const since = Date.parse(e.since) || 0;
    const existing = map.get(e.user_id);
    if (!existing) {
      map.set(e.user_id, {
        user_id: e.user_id,
        name: e.name,
        email: e.email,
        status: e.status,
        route: e.route,
        sessions: 1,
        lastActivity: last,
        since,
      });
      continue;
    }
    existing.sessions += 1;
    if (since && (!existing.since || since < existing.since)) existing.since = since;
    if (last > existing.lastActivity) {
      existing.lastActivity = last;
      existing.route = e.route;
    }
    if (e.status === "online") existing.status = "online";
  }
  return Array.from(map.values()).sort((a, b) => b.lastActivity - a.lastActivity);
}

export function AdminOnlineUsers() {
  const { entries, connected: channelConnected } = useOnlineUsers();
  // já recebendo presenças conta como conectado
  const connected = channelConnected || entries.length > 0;
  const { realName } = useUserNames();
  const [search, setSearch] = useState("");
  const [, setTick] = useState(0);

  // Mantém os rótulos de tempo relativos atualizados
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 20_000);
    return () => clearInterval(t);
  }, []);

  const users = useMemo(() => groupByUser(entries), [entries]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;
    return users.filter((u) =>
      [realName(u.user_id) || u.name, u.email ?? "", u.route].some((v) =>
        v.toLowerCase().includes(term),
      ),
    );
  }, [users, search, realName]);

  const onlineCount = users.filter((u) => u.status === "online").length;
  const idleCount = users.length - onlineCount;
  const sessions = entries.length;

  const nameOf = (u: OnlineUser) => realName(u.user_id) || u.name;
  const relative = (ts: number) =>
    ts ? `há ${formatDistanceToNowStrict(new Date(ts), { locale: ptBR })}` : "—";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Ativos agora", value: onlineCount, icon: Wifi, tone: "text-primary" },
          { label: "Ausentes", value: idleCount, icon: Clock, tone: "text-muted-foreground" },
          { label: "Usuários conectados", value: users.length, icon: Users, tone: "text-foreground" },
          { label: "Sessões abertas", value: sessions, icon: Users, tone: "text-foreground" },
        ].map((s) => (
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
            placeholder="Buscar por nome, e-mail ou tela..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {connected ? (
            <>
              <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              Atualizando em tempo real
            </>
          ) : (
            <>
              <WifiOff className="h-3.5 w-3.5" />
              Conectando...
            </>
          )}
        </span>
      </div>

      {/* Desktop */}
      <div className="hidden md:block rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuário</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Tela atual</TableHead>
              <TableHead>Sessões</TableHead>
              <TableHead>Última atividade</TableHead>
              <TableHead>Conectado desde</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  {connected ? "Ninguém conectado neste momento" : "Carregando..."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((u) => (
                <TableRow key={u.user_id}>
                  <TableCell className="font-medium">{nameOf(u)}</TableCell>
                  <TableCell className="text-muted-foreground">{u.email ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={u.status === "online" ? "default" : "secondary"}>
                      {u.status === "online" ? "Ativo" : "Ausente"}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{u.route}</TableCell>
                  <TableCell>{u.sessions}</TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">{relative(u.lastActivity)}</TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {u.since ? format(new Date(u.since), "dd/MM HH:mm") : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile */}
      <div className="md:hidden space-y-2">
        {filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">
            {connected ? "Ninguém conectado neste momento" : "Carregando..."}
          </p>
        ) : (
          filtered.map((u) => (
            <div key={u.user_id} className="rounded-md border p-3 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium truncate">{nameOf(u)}</p>
                <Badge variant={u.status === "online" ? "default" : "secondary"} className="text-[10px]">
                  {u.status === "online" ? "Ativo" : "Ausente"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground truncate">{u.email ?? "—"}</p>
              <p className="font-mono text-[11px] text-muted-foreground truncate">{u.route}</p>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{relative(u.lastActivity)}</span>
                <span>{u.sessions} sessão(ões)</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
