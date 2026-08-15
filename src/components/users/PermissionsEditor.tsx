import {
  FINANCE_MODULES,
  MODULE_LABELS,
  PermissionLevel,
  PermissionsMap,
  CompanyRole,
  ModuleKey,
} from "@/lib/permissions";
import { ORDERS_PERMISSION_KEYS } from "@/lib/orders/permissions";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

interface Props {
  role: CompanyRole;
  value: PermissionsMap;
  onChange: (next: PermissionsMap) => void;
}

const LEVELS: { value: PermissionLevel; label: string }[] = [
  { value: "none", label: "Sem acesso" },
  { value: "view", label: "Visualizar" },
  { value: "edit", label: "Editar" },
];

const SECTIONS: { title: string; modules: readonly ModuleKey[]; fallback: PermissionLevel }[] = [
  { title: "Financeiro", modules: FINANCE_MODULES, fallback: "edit" },
  { title: "Pedidos", modules: ORDERS_PERMISSION_KEYS, fallback: "none" },
];

export function PermissionsEditor({ role, value, onChange }: Props) {
  const disabled =
    role === "owner" || role === "admin" || role === "viewer" || role === "contabilidade";
  const disabledNote =
    role === "owner" || role === "admin"
      ? "Admins têm acesso total a todos os módulos."
      : role === "contabilidade"
        ? "Contabilidade tem acesso somente leitura e vê apenas contas e lançamentos marcados como contábeis."
        : role === "viewer"
        ? "Visualizadores têm acesso somente leitura em todos os módulos."
        : null;

  const set = (module: ModuleKey, level: PermissionLevel) => {
    onChange({ ...value, [module]: level });
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm">Permissões por módulo</Label>
      {disabledNote && <p className="text-xs text-muted-foreground">{disabledNote}</p>}
      <div className="rounded-md border divide-y max-h-[280px] overflow-y-auto">
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <div className="bg-muted/50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {section.title}
            </div>
            <div className="divide-y">
              {section.modules.map((m) => {
                const current = value[m] ?? section.fallback;
                return (
                  <div key={m} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="text-sm">{MODULE_LABELS[m]}</span>
                    <RadioGroup
                      value={current}
                      onValueChange={(v) => set(m, v as PermissionLevel)}
                      disabled={disabled}
                      className="flex gap-3"
                    >
                      {LEVELS.map((l) => (
                        <div key={l.value} className="flex items-center gap-1.5">
                          <RadioGroupItem value={l.value} id={`${m}-${l.value}`} className="h-3.5 w-3.5" />
                          <Label htmlFor={`${m}-${l.value}`} className="text-xs cursor-pointer font-normal">
                            {l.label}
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
