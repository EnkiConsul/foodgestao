import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export function DeleteMyAccountCard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const canDelete = confirmText === "EXCLUIR" && password.length >= 6 && !loading;

  const handleDelete = async () => {
    if (!user?.email) return;
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke("delete-user-account", {
        body: { email: user.email, password },
      });
      if (error) throw error;
      toast.success("Conta excluída", { description: "Seus dados foram removidos." });
      await signOut();
      navigate("/", { replace: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao excluir";
      toast.error("Erro ao excluir", { description: msg });
      setLoading(false);
    }
  };

  return (
    <Card className="border-destructive/30">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" /> Excluir minha conta
        </CardTitle>
        <CardDescription>
          Direito à eliminação (LGPD art. 18, VI). A exclusão é permanente. Dados pessoais serão
          removidos; registros legalmente obrigatórios podem ser mantidos anonimizados.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive">Excluir conta permanentemente</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar exclusão da conta</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação é <b>irreversível</b>. Todos os seus lançamentos, contas, contatos e
                anexos serão apagados.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Digite EXCLUIR para confirmar</Label>
                <Input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="EXCLUIR"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Sua senha atual</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  if (canDelete) handleDelete();
                }}
                disabled={!canDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Excluir minha conta
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
