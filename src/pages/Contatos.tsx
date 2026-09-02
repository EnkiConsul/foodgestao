import { toProperName } from "@/lib/text/properName";
import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ContactFormDialog } from "@/components/contacts/ContactFormDialog";
import { Plus, Search, Users, Pencil, Trash2, Mail, Phone } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

const TYPE_LABELS: Record<string, string> = {
  cliente: "Cliente",
  fornecedor: "Fornecedor",
  ambos: "Ambos",
};

const TYPE_COLORS: Record<string, string> = {
  cliente: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  fornecedor: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  ambos: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
};

export default function Contatos() {
  const { user } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editContact, setEditContact] = useState<Tables<"contacts"> | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Atualização em tempo real de contatos (clientes / fornecedores)
  useRealtimeSync({
    tables: ["contacts", "contact_companies"],
    invalidateKeyPrefixes: ["contacts-page", "contact-companies-page"],
  });

  const { data: contacts = [], refetch } = useQuery({
    queryKey: ["contacts-page", user?.id, contextType, selectedCompanyId],
    enabled: !!user && (contextType === "pf" || !!selectedCompanyId),
    queryFn: async () => {
      if (contextType === "pj") {
        // Em PJ: contatos vinculados à empresa ativa (visíveis a qualquer membro).
        const { data } = await supabase
          .from("contacts")
          .select("*, contact_companies!inner(company_id)")
          .eq("contact_companies.company_id", selectedCompanyId!)
          .order("name");
        return (data ?? []) as Tables<"contacts">[];
      }
      // Em PF: contatos do usuário, apenas visíveis no perfil pessoal.
      const { data } = await supabase
        .from("contacts")
        .select("*")
        .eq("user_id", user!.id)
        .eq("visible_pf", true)
        .order("name");
      return (data ?? []) as Tables<"contacts">[];
    },
  });

  // Fetch contact_companies with company names
  const { data: contactCompanies = [], refetch: refetchCompanies } = useQuery({
    queryKey: ["contact-companies-page", user?.id, contextType, selectedCompanyId],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await (supabase.from("contact_companies" as any) as any)
        .select("contact_id, company_id, companies(name, trade_name)");
      return (data ?? []) as Array<{ contact_id: string; company_id: string; companies: { name: string; trade_name: string | null } }>;
    },
  });

  const companyBadgesMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const cc of contactCompanies) {
      const names = map.get(cc.contact_id) ?? [];
      names.push(cc.companies?.trade_name || cc.companies?.name || "");
      map.set(cc.contact_id, names);
    }
    return map;
  }, [contactCompanies]);

  const filtered = useMemo(() => {
    return contacts.filter((c) => {
      const q = search.toLowerCase();
      const matchSearch =
        !search ||
        c.name.toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.phone ?? "").includes(q) ||
        (c.document ?? "").includes(q);
      const matchType = filterType === "all" || c.contact_type === filterType;
      return matchSearch && matchType;
    });
  }, [contacts, search, filterType]);

  const confirmDelete = async () => {
    if (!deleteId) return;
    const contact = contacts.find((c) => c.id === deleteId);
    const { error } = await supabase.from("contacts").delete().eq("id", deleteId);
    if (error) toast.error("Erro ao excluir", { description: error.message });
    else {
      await supabase.rpc("insert_audit_log", {
        _action: "contact_deleted",
        _entity_type: "contact",
        _entity_id: deleteId,
        _details: { target_name: contact?.name || "—" },
      });
      toast.success("Contato excluído"); refetch();
    }
    setDeleteId(null);
  };

  const openEdit = (c: Tables<"contacts">) => { setEditContact(c); setDialogOpen(true); };
  const openNew = () => { setEditContact(null); setDialogOpen(true); };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contatos</h1>
          <p className="text-sm text-muted-foreground">Gerencie clientes e fornecedores</p>
        </div>
        <Button onClick={openNew} className="hidden md:flex">
          <Plus className="h-4 w-4 mr-2" /> Novo Contato
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, e-mail, telefone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            maxLength={50}
          />
        </div>
        <Tabs value={filterType} onValueChange={setFilterType} className="w-full sm:w-auto">
          <TabsList className="w-full sm:w-auto overflow-x-auto flex justify-start">
            <TabsTrigger value="all">Todos</TabsTrigger>
            <TabsTrigger value="cliente">Clientes</TabsTrigger>
            <TabsTrigger value="fornecedor">Fornecedores</TabsTrigger>
            <TabsTrigger value="ambos">Ambos</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Contact list */}
      {contacts.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center py-12 text-muted-foreground">
            <Users className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm">Nenhum contato cadastrado</p>
            <Button variant="link" onClick={openNew} className="mt-2">
              Cadastrar primeiro contato
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((contact) => (
            <Card key={contact.id} className="shadow-sm hover:shadow transition-shadow">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">
                  {toProperName(contact.name).slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium truncate">{toProperName(contact.name)}</p>
                    <Badge variant="secondary" className={`text-[10px] h-4 px-1.5 border-0 ${TYPE_COLORS[contact.contact_type]}`}>
                      {TYPE_LABELS[contact.contact_type]}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                    {contact.email && (
                      <span className="flex items-center gap-1 truncate">
                        <Mail className="h-3 w-3 shrink-0" /> {contact.email}
                      </span>
                    )}
                    {contact.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3 shrink-0" /> {contact.phone}
                      </span>
                    )}
                    {contact.document && (
                      <span className="truncate">{contact.document}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    {(companyBadgesMap.get(contact.id) ?? []).map((name, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px] h-4 px-1.5">{name}</Badge>
                    ))}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-primary" onClick={() => openEdit(contact)} aria-label="Editar contato">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(contact.id)} aria-label="Excluir contato">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {filtered.length === 0 && contacts.length > 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum contato encontrado</p>
          )}
        </div>
      )}

      {/* FAB mobile */}
      <button
        onClick={openNew}
        className="fixed bottom-20 right-4 z-50 md:hidden flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
      >
        <Plus className="h-6 w-6" />
      </button>

      <ContactFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={() => { refetch(); refetchCompanies(); }}
        editContact={editContact}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir contato?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O contato será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
