import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { logger, toErrorMessage } from "@/lib/logger";
import { isStaleBundleError, recoverFromStaleBundle } from "@/lib/staleBundle";


interface ErrorBoundaryProps {
  children: ReactNode;
  /** Área funcional, usada no log: "financeiro", "dp", "rota"... */
  scope?: string;
  /** Fallback customizado; quando ausente usa o painel padrão. */
  fallback?: ReactNode;
  /** Rótulo amigável exibido ao usuário. */
  title?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Barreira de erro de renderização.
 *
 * Sem ela, qualquer exceção durante o render derruba o app inteiro para uma tela
 * branca. Envolvemos as rotas (e áreas de risco, como gráficos e relatórios)
 * para conter a falha e oferecer recuperação sem perder a sessão.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Versão antiga em cache no aparelho: limpa e recarrega sozinho.
    if (isStaleBundleError(error)) void recoverFromStaleBundle();
    logger.error("Falha de renderização contida pelo ErrorBoundary", error, {
      scope: this.props.scope ?? "boundary",
      componentStack: info.componentStack?.slice(0, 2000),
      path: typeof window !== "undefined" ? window.location.pathname : undefined,
    });
  }

  private reset = () => this.setState({ error: null });

  private reload = () => window.location.reload();


  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="flex min-h-[60vh] items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
            </div>
            <CardTitle className="text-lg">
              {this.props.title ?? "Não foi possível exibir esta tela"}
            </CardTitle>
            <CardDescription>
              Registramos o problema. Seus dados estão salvos — tente novamente ou volte ao
              início.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <pre className="max-h-28 overflow-auto rounded-md bg-muted p-3 text-xs text-muted-foreground">
              {toErrorMessage(error)}
            </pre>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={this.reset} className="flex-1">
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                Tentar novamente
              </Button>
              <Button variant="outline" onClick={this.reload} className="flex-1">
                Recarregar
              </Button>
              <Button variant="ghost" asChild className="flex-1">
                <a href="/hub">
                  <Home className="mr-2 h-4 w-4" aria-hidden="true" />
                  Início
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
}

export default ErrorBoundary;
