import { useState } from "react";
import { AlertTriangle, Loader2, Search, ShieldCheck, ShieldOff, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatDate } from "@/lib/date-utils";
import { useAuth } from "@/hooks/useAuth";
import {
  useBackofficeCandidatos, useBackofficeUsuarios, useConcederBackoffice, useRevogarBackoffice,
  type BackofficeUsuario,
} from "@/hooks/useBackofficeUsuarios";

export function AdminBackofficeUsuarios() {
  const { user } = useAuth();
  const { data: usuarios = [], isLoading, error, refetch } = useBackofficeUsuarios();
  const [abrirAdicionar, setAbrirAdicionar] = useState(false);
  const [busca, setBusca] = useState("");
  const [revogar, setRevogar] = useState<BackofficeUsuario | null>(null);

  const conceder = useConcederBackoffice();
  const revogarAcesso = useRevogarBackoffice();
  const candidatos = useBackofficeCandidatos(busca, abrirAdicionar);

  const unico = usuarios.length <= 1;

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="flex flex-wrap items-center gap-3">
          Não foi possível carregar a lista de acessos.
          <Button size="sm" variant="outline" onClick={() => refetch()}>Tentar De Novo</Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertDescription>
          Quem tem acesso ao Backoffice vê todas as empresas, assinaturas e configurações da
          plataforma. Conceda apenas para pessoas da sua equipe interna.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">
            Acessos Ativos{" "}
            <Badge variant="secondary" className="ml-1">{usuarios.length}</Badge>
          </CardTitle>
          <Button size="sm" onClick={() => { setBusca(""); setAbrirAdicionar(true); }}>
            <UserPlus className="mr-2 h-4 w-4" />
            Conceder Acesso
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : usuarios.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum acesso encontrado.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pessoa</TableHead>
                    <TableHead className="hidden md:table-cell">Acesso Desde</TableHead>
                    <TableHead className="hidden md:table-cell">Último Acesso</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usuarios.map((u) => {
                    const souEu = u.user_id === user?.id;
                    return (
                      <TableRow key={u.user_id}>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <span className="flex flex-wrap items-center gap-2 font-medium">
                              {u.nome}
                              {souEu && <Badge variant="outline">Sua Conta</Badge>}
                            </span>
                            <span className="text-xs text-muted-foreground">{u.email}</span>
                            <span className="text-xs text-muted-foreground md:hidden">
                              Desde {formatDate(u.concedido_em, "dd/MM/yyyy")}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden whitespace-nowrap md:table-cell">
                          {formatDate(u.concedido_em, "dd/MM/yyyy")}
                        </TableCell>
                        <TableCell className="hidden whitespace-nowrap md:table-cell">
                          {u.ultimo_acesso ? formatDate(u.ultimo_acesso, "dd/MM/yyyy HH:mm") : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            disabled={unico || revogarAcesso.isPending}
                            onClick={() => setRevogar(u)}
                          >
                            <ShieldOff className="mr-2 h-4 w-4" />
                            Revogar
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {unico && usuarios.length === 1 && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Este é o único acesso ao Backoffice e não pode ser revogado.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Conceder acesso */}
      <Dialog open={abrirAdicionar} onOpenChange={setAbrirAdicionar}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Conceder Acesso ao Backoffice</DialogTitle>
            <DialogDescription>
              Busque pelo nome, e-mail ou documento do usuário já cadastrado na plataforma.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              aria-label="Buscar usuário"
              placeholder="Nome, e-mail ou documento"
              className="pl-9"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>

          <div className="max-h-72 space-y-2 overflow-y-auto">
            {candidatos.isLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : candidatos.data && candidatos.data.length > 0 ? (
              candidatos.data.map((c) => (
                <div
                  key={c.user_id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.nome}</p>
                    <p className="truncate text-xs text-muted-foreground">{c.email}</p>
                  </div>
                  <Button
                    size="sm"
                    disabled={conceder.isPending}
                    onClick={() =>
                      conceder.mutate(c.user_id, { onSuccess: () => setAbrirAdicionar(false) })
                    }
                  >
                    {conceder.isPending
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : "Conceder"}
                  </Button>
                </div>
              ))
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhum usuário encontrado para essa busca.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmar revogação */}
      <AlertDialog open={!!revogar} onOpenChange={(o) => !o && setRevogar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revogar acesso ao Backoffice?</AlertDialogTitle>
            <AlertDialogDescription>
              {revogar?.user_id === user?.id
                ? "Você está removendo o seu próprio acesso. Depois de confirmar, você sairá do Backoffice e só outro administrador poderá devolver o acesso."
                : `${revogar?.nome} deixará de ver as informações da plataforma no Backoffice. O acesso à própria empresa continua normal.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (revogar) revogarAcesso.mutate(revogar.user_id);
                setRevogar(null);
              }}
            >
              Revogar Acesso
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
