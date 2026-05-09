import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export function ResetOnboardingCard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (!user) return;
    setLoading(true);
    const { error } = await supabase
      .from("profiles")
      .update({ onboarding_completed: false, onboarding_data: null })
      .eq("user_id", user.id);
    setLoading(false);
    if (error) {
      toast.error("Erro ao resetar onboarding", { description: error.message });
      return;
    }
    toast.success("Onboarding resetado", { description: "Refazendo o checklist..." });
    navigate("/onboarding");
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <RotateCcw className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">Resetar onboarding</CardTitle>
        </div>
        <CardDescription>
          Marca o onboarding como não concluído e limpa as respostas salvas. Útil para refazer o
          checklist do zero.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" disabled={loading}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Resetar onboarding
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Resetar onboarding?</AlertDialogTitle>
              <AlertDialogDescription>
                Isso irá apagar suas respostas salvas do checklist e marcar o onboarding como não
                concluído. Os dados já criados (contas, categorias, empresa) não serão removidos.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleReset}>Confirmar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
