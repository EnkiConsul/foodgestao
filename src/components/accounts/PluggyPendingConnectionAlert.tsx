import { useState, useEffect, useCallback } from "react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";

interface PluggyPendingConnectionAlertProps {
  companyId: string;
}

export function PluggyPendingConnectionAlert({ companyId }: PluggyPendingConnectionAlertProps) {
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [canceling, setCanceling] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);


  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    const { count } = await supabase
      .from("pluggy_connect_requests")
      .select("id", { head: true, count: "exact" })
      .eq("company_id", companyId)
      .eq("status", "open")
      .gt("expires_at", new Date().toISOString());
    setPendingCount(count ?? 0);
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCancel = async () => {
    setCanceling(true);
    const anterior = pendingCount;
    const { data, error } = await supabase.rpc("pluggy_cancel_connect_requests", {
      _company_id: companyId,
    });

    if (error) {
      setCanceling(false);
      const motivo = (error.message ?? "").toLowerCase();
      let texto = "Não foi possível cancelar a conexão em andamento.";
      if (motivo.includes("not_authenticated")) {
        texto += " Sua sessão expirou. Faça login novamente.";
      } else if (motivo.includes("forbidden")) {
        texto += " Você não tem permissão para cancelar esta autorização.";
      } else if (error.message) {
        texto += ` Motivo: ${error.message}`;
      }
      toast.error(texto);
      return;
    }

    setPendingCount(0);
    const canceladas = (data as number | null) ?? anterior;
    toast.success(
      canceladas > 1 ? `${canceladas} autorizações canceladas` : "Conexão em andamento cancelada",
    );
    setCanceling(false);
  };

  if (loading || pendingCount === 0) return null;

  return (
    <Card className="border-warning/40 bg-warning/5">
      <CardContent className="p-4 flex items-start gap-3">
        <Loader2 className="h-4 w-4 mt-0.5 animate-spin text-warning shrink-0" />
        <div className="text-sm min-w-0 flex-1">
          <p className="font-semibold">Conexão em andamento</p>
          <p className="text-muted-foreground text-xs mt-0.5">
            Há {pendingCount} autorização(ões) iniciada(s) aguardando a confirmação do banco.
            Se você autorizou pelo app do banco (QR Code), a conexão pode levar alguns minutos
            para aparecer. Use <strong>Atualizar</strong> abaixo ou tente novamente em instantes.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="h-7" onClick={() => load()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Atualizar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-destructive hover:text-destructive"
              disabled={canceling}
              onClick={handleCancel}
            >
              {canceling ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <X className="h-3.5 w-3.5 mr-1" />
              )}
              Cancelar conexão
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
