import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { ArrowLeft, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MODULE_BY_SLUG, type AppModule } from "@/lib/modules";

/**
 * Placeholder exibido enquanto o módulo ainda não foi implementado.
 * O ModuleGuard já barra usuários sem contratação; esta tela aparece
 * apenas para empresas com o módulo ativo mas antes do porte completo.
 */
export function ModulePlaceholder({ module }: { module: AppModule }) {
  const def = MODULE_BY_SLUG[module];
  const Icon = def.icon;
  return (
    <div className="mx-auto max-w-2xl py-10">
      <Helmet><title>{def.name} — Aveto 360</title></Helmet>
      <Card>
        <CardContent className="p-8 text-center space-y-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Icon className="h-8 w-8 text-primary" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">{def.name}</h1>
            <p className="text-muted-foreground">{def.description}</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
            <Sparkles className="h-4 w-4" /> Em implantação
          </div>
          <p className="text-sm text-muted-foreground">
            Este módulo está sendo integrado ao Aveto 360. Em breve todas as funcionalidades
            estarão disponíveis por aqui.
          </p>
          <Button asChild variant="outline">
            <Link to="/hub"><ArrowLeft className="h-4 w-4 mr-2" /> Voltar ao Hub</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
