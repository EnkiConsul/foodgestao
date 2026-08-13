import { Card, CardContent } from "@/components/ui/card";
import { useModulosCatalogo } from "@/hooks/useModulosCatalogo";

/**
 * Seção pública com os módulos escolhidos no backoffice (show_on_landing).
 */
export function ModulesSection() {
  const { data } = useModulosCatalogo();
  const modulos = (data ?? []).filter((m) => m.show_on_landing);

  if (modulos.length === 0) return null;

  return (
    <section id="modulos" className="py-14 sm:py-20 lg:py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary sm:text-sm">
            Módulos
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
            Monte a gestão do seu negócio por módulos
          </h2>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">
            Contrate somente o que precisa e adicione novos módulos quando quiser.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:mt-12 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
          {modulos.map((m) => {
            const Icon = m.Icon;
            return (
              <Card
                key={m.id}
                className="border-border/60 transition-all hover:-translate-y-0.5 hover:shadow-lg"
              >
                <CardContent className="p-5 sm:p-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold sm:text-lg">{m.nome}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{m.descricao_curta}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
