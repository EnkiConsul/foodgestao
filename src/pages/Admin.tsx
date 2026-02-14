import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminStats } from "@/components/admin/AdminStats";
import { AdminUsers } from "@/components/admin/AdminUsers";
import { AdminCompanies } from "@/components/admin/AdminCompanies";
import { ShieldCheck } from "lucide-react";

export default function Admin() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Administração</h1>
          <p className="text-muted-foreground text-sm">Painel de gestão da plataforma</p>
        </div>
      </div>

      <Tabs defaultValue="stats" className="space-y-4">
        <TabsList>
          <TabsTrigger value="stats">Estatísticas</TabsTrigger>
          <TabsTrigger value="users">Usuários</TabsTrigger>
          <TabsTrigger value="companies">Perfis de Acesso</TabsTrigger>
        </TabsList>

        <TabsContent value="stats">
          <AdminStats />
        </TabsContent>
        <TabsContent value="users">
          <AdminUsers />
        </TabsContent>
        <TabsContent value="companies">
          <AdminCompanies />
        </TabsContent>
      </Tabs>
    </div>
  );
}
