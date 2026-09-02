import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  selectedCount: number;
  visiblePf: boolean;
  setVisiblePf: (v: boolean) => void;
  companies: { id: string; name: string }[];
  selectedCompanies: Set<string>;
  toggleCompany: (id: string) => void;
  onApply: () => void;
  saving: boolean;
}

export function BatchVisibilityDialog({
  open,
  onOpenChange,
  selectedCount,
  visiblePf,
  setVisiblePf,
  companies,
  selectedCompanies,
  toggleCompany,
  onApply,
  saving,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Alterar Visibilidade ({selectedCount} categorias)</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Selecione onde as categorias ficarão disponíveis</p>
          {companies.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Empresas</p>
              {companies.map((company) => (
                <label key={company.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selectedCompanies.has(company.id)}
                    onCheckedChange={() => toggleCompany(company.id)}
                  />
                  {company.name}
                </label>
              ))}
            </div>
          )}
          <Button className="w-full" onClick={onApply} disabled={saving}>
            {saving ? "Salvando..." : "Aplicar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
