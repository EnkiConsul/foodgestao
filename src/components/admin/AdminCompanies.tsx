import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate } from "@/lib/date-utils";

export function AdminCompanies() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["admin-companies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = companies.filter((c) => {
    const term = search.toLowerCase();
    const matchesSearch =
      c.name.toLowerCase().includes(term) ||
      (c.trade_name?.toLowerCase().includes(term) ?? false) ||
      (c.cnpj?.toLowerCase().includes(term) ?? false);
    const matchesType = typeFilter === "all" || c.profile_type === typeFilter;
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && c.is_active) ||
      (statusFilter === "inactive" && !c.is_active);
    return matchesSearch && matchesType && matchesStatus;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:gap-3">
        <div className="relative sm:max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, fantasia ou CNPJ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="flex-1 sm:w-[160px]">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              <SelectItem value="empresarial">Empresarial</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="flex-1 sm:w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Ativo</SelectItem>
              <SelectItem value="inactive">Inativo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden md:block rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome / Razão Social</TableHead>
              <TableHead>Nome Fantasia</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Cadastro</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Nenhum perfil encontrado
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((company) => (
                <TableRow key={company.id}>
                  <TableCell className="font-medium">{company.name}</TableCell>
                  <TableCell>{company.trade_name || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">{company.profile_type}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={company.is_active ? "default" : "secondary"}>
                      {company.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(company.created_at, "dd/MM/yyyy")}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile */}
      <div className="md:hidden space-y-2">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-md border p-3"><Skeleton className="h-12 w-full" /></div>
          ))
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">Nenhum perfil encontrado</p>
        ) : (
          filtered.map((company) => (
            <div key={company.id} className="rounded-md border p-3 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium truncate">{company.name}</p>
                  {company.trade_name && <p className="text-xs text-muted-foreground truncate">{company.trade_name}</p>}
                </div>
                <Badge variant={company.is_active ? "default" : "secondary"} className="shrink-0 text-[10px]">
                  {company.is_active ? "Ativo" : "Inativo"}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <Badge variant="outline" className="capitalize text-[10px]">{company.profile_type}</Badge>
                <span>{formatDate(company.created_at, "dd/MM/yyyy")}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
