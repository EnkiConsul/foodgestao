import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { RefreshCw, PauseCircle, PlayCircle, Mail } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type Row = {
  id: string;
  company_id: string;
  empresa: string | null;
  subscription_id: string | null;
  invoice_id: string | null;
  stage: string;
  recipient: string;
  status: string;
  attempts: number;
  last_error: string | null;
  provider_message_id: string | null;
  scheduled_at: string;
  sent_at: string | null;
  created_at: string;
  pausada_ate: string | null;
  pausa_motivo: string | null;
};

const ESTAGIOS: Record<string, string> = {
  d_menos_3: "D-3 · Lembrete",
  d_0: "D0 · Vencimento",
  d_mais_1: "D+1 · Atraso",
  d_mais_5: "D+5 · Tolerância",
  d_mais_8: "D+8 · Aviso de suspensão",
  d_mais_10: "D+10 · Último aviso",
  d_mais_11: "D+11 · Suspensão efetivada",
  d_mais_20: "D+20 · Suspenso",
  d_mais_28: "D+28 · Aviso de rescisão",
  d_mais_31: "D+31 · Rescisão (formal)",
  d_mais_60: "D+60 · Rescindido",
  d_mais_80: "D+80 · Aviso de expiração",
  d_mais_90: "D+90 · Expiração",
  reativacao: "Pagamento · Reativação",
  trial_d5: "Trial D5 · Termina em 2 dias",
  trial_d7: "Trial D7 · Encerrado",
  trial_pos_3: "Trial +3 · Reengajamento",
  trial_pos_10: "Trial +10 · Último contato",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  sent: "Enviado",
  failed: "Falhou",
  cancelled: "Cancelado",
};

const statusVariant = (s: string) =>
  s === "sent" ? "default" : s === "failed" ? "destructive" : s === "cancelled" ? "outline" : "secondary";

const dataHora = (v?: string | null) =>
  v ? format(new Date(v), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—";

export default function AdminReguaCobranca() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState<string>("todos");
  const [pausando, setPausando] = useState<Row | null>(null);
  const [dias, setDias] = useState("15");
  const [motivo, setMotivo] = useState("");

  const { data = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["regua-cobranca", status],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("billing_dunning_historico", {
        _busca: null,
        _status: status === "todos" ? null : status,
        _limite: 300,
      });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const filtradas = useMemo(() => {
    const s = busca.trim().toLowerCase();
    if (!s) return data;
    return data.filter(
      (r) =>
        (r.empresa ?? "").toLowerCase().includes(s) || r.recipient.toLowerCase().includes(s),
    );
  }, [data, busca]);

  const pausar = useMutation({
    mutationFn: async (args: { subscriptionId: string; until: string | null; motivo: string | null }) => {
      const { error } = await supabase.rpc("billing_dunning_pausar", {
        _subscription_id: args.subscriptionId,
        _until: args.until,
        _motivo: args.motivo,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Régua atualizada");
      setPausando(null);
      setMotivo("");
      qc.invalidateQueries({ queryKey: ["regua-cobranca"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível atualizar a régua"),
  });

  const confirmarPausa = () => {
    if (!pausando?.subscription_id) return;
    const n = Math.max(1, Math.min(180, Number(dias) || 15));
    const until = new Date();
    until.setDate(until.getDate() + n);
    pausar.mutate({
      subscriptionId: pausando.subscription_id,
      until: until.toISOString(),
      motivo: motivo.trim() || null,
    });
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Régua de Cobrança"
        description="Histórico dos e-mails da assinatura e do teste, com pausa por negociação. O e-mail é o canal oficial de notificação."
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4" /> Envios ({filtradas.length})
          </CardTitle>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Buscar por empresa ou e-mail"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-56"
            />
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="sent">Enviado</SelectItem>
                <SelectItem value="failed">Falhou</SelectItem>
                <SelectItem value="cancelled">Cancelado</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Estágio</TableHead>
                  <TableHead>Destinatário</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Enviado em</TableHead>
                  <TableHead>Prova de envio</TableHead>
                  <TableHead className="text-right">Régua</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      Carregando…
                    </TableCell>
                  </TableRow>
                ) : filtradas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      Nenhum envio registrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtradas.map((r) => {
                    const pausada = r.pausada_ate && new Date(r.pausada_ate) > new Date();
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.empresa ?? "—"}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {ESTAGIOS[r.stage] ?? r.stage}
                        </TableCell>
                        <TableCell className="text-sm">{r.recipient}</TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(r.status) as never}>
                            {STATUS_LABEL[r.status] ?? r.status}
                          </Badge>
                          {r.last_error ? (
                            <p className="mt-1 max-w-[220px] text-xs text-muted-foreground">
                              {r.last_error}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {dataHora(r.sent_at ?? null)}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                          {r.provider_message_id ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {!r.subscription_id ? (
                            "—"
                          ) : pausada ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                pausar.mutate({
                                  subscriptionId: r.subscription_id!,
                                  until: null,
                                  motivo: null,
                                })
                              }
                            >
                              <PlayCircle className="mr-1 h-4 w-4" /> Retomar
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setPausando(r);
                                setDias("15");
                                setMotivo("");
                              }}
                            >
                              <PauseCircle className="mr-1 h-4 w-4" /> Pausar
                            </Button>
                          )}
                          {pausada ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Pausada até {dataHora(r.pausada_ate)}
                            </p>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!pausando} onOpenChange={(o) => !o && setPausando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pausar a régua de {pausando?.empresa ?? "—"}</DialogTitle>
            <DialogDescription>
              Durante a pausa, nenhuma mensagem de cobrança é enfileirada para esta assinatura. O
              bloqueio de acesso por inadimplência não é afetado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dias">Pausar por quantos dias?</Label>
              <Input
                id="dias"
                type="number"
                min={1}
                max={180}
                value={dias}
                onChange={(e) => setDias(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="motivo">Motivo da negociação</Label>
              <Input
                id="motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex.: Parcelamento acordado com o cliente"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPausando(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmarPausa} disabled={pausar.isPending}>
              Pausar régua
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
