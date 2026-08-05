import { AlarmClock, Bell, BellOff, Printer, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { useOrdersAlerts } from "@/hooks/useOrdersAlerts";

interface Props {
  alerts: ReturnType<typeof useOrdersAlerts>;
  onAcknowledgeAll?: () => void;
  pendingCount?: number;
}

export function AlertsControl({ alerts, onAcknowledgeAll, pendingCount = 0 }: Props) {
  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Switch id="alert-sound" checked={alerts.soundEnabled} onCheckedChange={alerts.setSoundEnabled} />
          <Label htmlFor="alert-sound" className="flex items-center gap-1 text-xs">
            <Volume2 className="h-3.5 w-3.5" aria-hidden="true" /> Alerta sonoro
          </Label>
        </div>

        <div className="flex min-w-40 items-center gap-2">
          <Label htmlFor="alert-volume" className="text-xs">
            Volume
          </Label>
          <Slider
            id="alert-volume"
            className="w-28"
            min={0}
            max={100}
            step={5}
            value={[Math.round(alerts.volume * 100)]}
            onValueChange={([v]) => alerts.setVolume(v / 100)}
            aria-label="Volume do alerta sonoro"
          />
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="alert-notify"
            checked={alerts.notificationsEnabled}
            disabled={alerts.permissionBlocked || alerts.permission === "unsupported"}
            onCheckedChange={async (checked) => {
              if (!checked) {
                alerts.setNotificationsEnabled(false);
                return;
              }
              await alerts.requestNotificationPermission();
            }}
          />
          <Label htmlFor="alert-notify" className="flex items-center gap-1 text-xs">
            {alerts.notificationsEnabled ? (
              <Bell className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <BellOff className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Notificação do navegador
          </Label>
        </div>

        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="min-h-11" onClick={() => void alerts.testSound()}>
            <Volume2 className="mr-2 h-4 w-4" aria-hidden="true" /> Testar som
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="min-h-11"
            onClick={() => void alerts.testNotification()}
          >
            <Bell className="mr-2 h-4 w-4" aria-hidden="true" /> Testar notificação
          </Button>
          {onAcknowledgeAll && (
            <Button
              variant="secondary"
              size="sm"
              className="min-h-11"
              onClick={onAcknowledgeAll}
              disabled={pendingCount === 0}
            >
              <AlarmClock className="mr-2 h-4 w-4" aria-hidden="true" /> Reconhecer alertas
            </Button>
          )}
        </div>
      </div>

      {alerts.permissionBlocked && (
        <Alert variant="destructive">
          <AlertDescription className="text-xs">
            As notificações estão bloqueadas para este site. Libere-as nas permissões do navegador
            para voltar a receber avisos — o alerta sonoro e o visual continuam funcionando.
          </AlertDescription>
        </Alert>
      )}
      {alerts.permission === "unsupported" && (
        <p className="text-xs text-muted-foreground">
          <Printer className="mr-1 inline h-3 w-3" aria-hidden="true" />
          Este navegador não suporta notificações; use o alerta sonoro e visual.
        </p>
      )}
    </div>
  );
}
