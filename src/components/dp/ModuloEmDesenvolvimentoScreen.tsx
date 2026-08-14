import { Link } from "react-router-dom";
import { HardHat, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ModuloEmDesenvolvimentoScreenProps {
  /** Nome comercial do módulo pausado (ex.: "Ponto"). */
  titulo: string;
  /** Rota do botão de retorno. */
  voltarPara?: string;
  voltarLabel?: string;
  /** Texto complementar opcional. */
  descricao?: string;
}

export function ModuloEmDesenvolvimentoScreen({
  titulo,
  voltarPara = "/dp",
  voltarLabel = "Voltar ao DP 360°",
  descricao,
}: ModuloEmDesenvolvimentoScreenProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <Card className="w-full max-w-md border-dashed">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <HardHat className="h-7 w-7" />
          </div>

          <div className="space-y-2">
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
              Em breve
            </Badge>
            <h1 className="text-xl font-semibold">Módulo em desenvolvimento</h1>
            <p className="text-sm text-muted-foreground">
              {descricao ??
                `O módulo de ${titulo} está em desenvolvimento e será liberado em breve. As informações já registradas permanecem salvas com segurança.`}
            </p>
          </div>

          <Button asChild variant="outline" className="mt-2">
            <Link to={voltarPara}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {voltarLabel}
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default ModuloEmDesenvolvimentoScreen;
