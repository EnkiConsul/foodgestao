import { useState } from "react";
import { Link } from "react-router-dom";
import { Bell, HeartPulse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDpNotificacoes, useMarkNotifRead } from "@/hooks/useDpNotificacoes";
import { useDpAtestadosPendentes } from "@/hooks/useDpAtestadosPendentes";

const REF_TO_PATH: Record<string, string> = {
  dp_solicitacoes: "/dp/solicitacoes",
  dp_trocas: "/dp/trocas",
  dp_registros_disciplinares: "/dp/disciplinar",
};

export function DpNotificacoesBell() {
  const [open, setOpen] = useState(false);
  const { data } = useDpNotificacoes();
  const { data: atestados = [] } = useDpAtestadosPendentes();
  const markRead = useMarkNotifRead();

  const list = data ?? [];
  const unread = list.filter((n) => !n.lida_em);
  const totalBadge = unread.length + atestados.length;

  const markAll = () => markRead.mutate(unread.map((n) => n.id));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {totalBadge > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 min-w-5 rounded-full px-1 text-[10px] bg-primary">
              {totalBadge > 99 ? "99+" : totalBadge}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div className="text-sm font-semibold">Notificações</div>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={markAll} disabled={unread.length === 0}>
              Marcar todas
            </Button>
            <Button size="sm" variant="ghost" asChild onClick={() => setOpen(false)}>
              <Link to="/dp/notificacoes">Ver todas</Link>
            </Button>
          </div>
        </div>
        {atestados.length > 0 && (
          <Link
            to="/dp/solicitacoes?tipo=atestado"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 bg-amber-50 border-b border-amber-200 hover:bg-amber-100"
          >
            <HeartPulse className="h-4 w-4 text-amber-700" />
            <span className="text-xs font-medium text-amber-900 flex-1">
              {atestados.length} atestado{atestados.length > 1 ? "s" : ""} aguardando análise
            </span>
            <Badge className="bg-amber-600 text-white text-[10px]">{atestados.length}</Badge>
          </Link>
        )}
        <ScrollArea className="max-h-96">
          {list.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Nenhuma notificação.</div>
          ) : (
            <ul className="divide-y">
              {list.slice(0, 15).map((n) => {
                const path = REF_TO_PATH[n.ref_table] ?? "/dp/notificacoes";
                return (
                  <li key={n.id} className={n.lida_em ? "opacity-60" : ""}>
                    <Link
                      to={path}
                      className="flex flex-col gap-0.5 px-3 py-2 hover:bg-muted"
                      onClick={() => {
                        if (!n.lida_em) markRead.mutate([n.id]);
                        setOpen(false);
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium">{n.titulo}</div>
                        {!n.lida_em && <div className="h-2 w-2 rounded-full bg-primary" />}
                      </div>
                      {n.descricao && <div className="text-xs text-muted-foreground">{n.descricao}</div>}
                      <div className="text-[10px] text-muted-foreground">
                        {new Date(n.created_at).toLocaleString("pt-BR")}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
