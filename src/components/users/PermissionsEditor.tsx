import {
  LEVELS,
  MODULOS,
  MODULE_LABELS,
  ModulosMap,
  PermissionLevel,
  PermissionsMap,
  CompanyRole,
  ModuleKey,
  SECTIONS,
  normalizeLevel,
  roleTemMatrizFixa,
} from "@/lib/permissions";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface Props {
  role: CompanyRole;
  value: PermissionsMap;
  onChange: (next: PermissionsMap) => void;
  modulos?: ModulosMap;
  onModulosChange?: (next: ModulosMap) => void;
  verSaldos?: boolean;
  verSalarios?: boolean;
  onFlagsChange?: (flags: { ver_saldos: boolean; ver_salarios: boolean }) => void;
}

export function PermissionsEditor({
  role, value, onChange, modulos, onModulosChange, verSaldos = true, verSalarios = true, onFlagsChange,
}: Props) {
  const fixed = roleTemMatrizFixa(role);
  const acessoTotal = role === "owner" || role === "admin";
  const note =
    acessoTotal
      ? "Donos e administradores têm acesso total a todos os módulos."
      : role === "contabilidade" || role === "viewer"
        ? "Este perfil tem somente leitura no Financeiro."
        : null;

  const set = (m: ModuleKey, level: PermissionLevel) => onChange({ ...value, [m]: level });
  const setSection = (items: readonly ModuleKey[], level: PermissionLevel) =>
    onChange({ ...value, ...Object.fromEntries(items.map((i) => [i, level])) });

  const nivelDe = (m: ModuleKey, off: boolean, disabled: boolean): PermissionLevel =>
    acessoTotal ? "total" : off ? "none" : (normalizeLevel(value[m] as string) ?? "none");

  return (
    <div className="space-y-4">
      {modulos && onModulosChange && (
        <div className="space-y-2">
          <Label className="text-sm">Módulos liberados</Label>
          <div className="grid gap-2 sm:grid-cols-3">
            {MODULOS.map((m) => (
              <label
                key={m.key}
                className="flex items-start gap-3 rounded-lg border bg-card p-3 cursor-pointer active:bg-accent/40"
              >
                <Switch
                  className="mt-0.5 shrink-0"
                  checked={fixed && acessoTotal ? true : modulos[m.key]}
                  disabled={acessoTotal}
                  onCheckedChange={(c) => onModulosChange({ ...modulos, [m.key]: c })}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{m.label}</span>
                  <span className="block text-xs leading-snug text-muted-foreground">{m.descricao}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {onFlagsChange && !acessoTotal && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3 min-h-12">
            <span className="text-sm">Ver saldos e valores financeiros</span>
            <Switch checked={verSaldos} onCheckedChange={(c) => onFlagsChange({ ver_saldos: c, ver_salarios: verSalarios })} />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3 min-h-12">
            <span className="text-sm">Ver salários e remuneração</span>
            <Switch checked={verSalarios} onCheckedChange={(c) => onFlagsChange({ ver_saldos: verSaldos, ver_salarios: c })} />
          </label>
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-sm">Permissões por item</Label>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}

        {/* Mobile: cartões com seletor tátil por item */}
        <div className="md:hidden space-y-3">
          {SECTIONS.map((s) => {
            const off = !!modulos && modulos[s.modulo] === false && !acessoTotal;
            const disabled = fixed || off;
            return (
              <div key={s.modulo} className="rounded-lg border bg-card overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/50 px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide">
                    {s.title}
                    {off && <span className="ml-1 font-normal normal-case text-muted-foreground">— módulo desligado</span>}
                  </p>
                  {!disabled && (
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <span>Todos:</span>
                      <button
                        type="button"
                        className="rounded border px-2 py-1 text-[11px] font-medium text-foreground active:bg-accent"
                        onClick={() => setSection(s.items, "consulta")}
                      >
                        Consulta
                      </button>
                      <button
                        type="button"
                        className="rounded border px-2 py-1 text-[11px] font-medium text-foreground active:bg-accent"
                        onClick={() => setSection(s.items, "total")}
                      >
                        Total
                      </button>
                      <button
                        type="button"
                        className="rounded border px-2 py-1 text-[11px] font-medium text-foreground active:bg-accent"
                        onClick={() => setSection(s.items, "none")}
                      >
                        Sem
                      </button>
                    </div>
                  )}
                </div>
                <div className="divide-y">
                  {s.items.map((m) => {
                    const current = nivelDe(m, off, disabled);
                    return (
                      <div key={m} className="px-3 py-2.5 space-y-2">
                        <p className="text-sm font-medium leading-tight">{MODULE_LABELS[m]}</p>
                        <div className="grid grid-cols-5 gap-1" role="radiogroup" aria-label={MODULE_LABELS[m]}>
                          {LEVELS.map((l) => (
                            <button
                              key={l.value}
                              type="button"
                              role="radio"
                              aria-checked={current === l.value}
                              aria-label={`${MODULE_LABELS[m]}: ${l.label}`}
                              disabled={disabled}
                              onClick={() => onSetSafe(disabled, () => set(m, l.value))}
                              className={cn(
                                "min-h-9 rounded-md border px-1 text-[11px] font-medium leading-none transition-colors",
                                current === l.value
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "bg-background text-muted-foreground active:bg-accent",
                                disabled && "opacity-50",
                              )}
                            >
                              {l.short}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop: matriz */}
        <div className="hidden md:block rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="text-left px-3 py-2 font-semibold">Item</th>
                {LEVELS.map((l) => (
                  <th key={l.value} className="px-2 py-2 font-semibold text-center whitespace-nowrap">{l.short}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SECTIONS.map((s) => {
                const off = !!modulos && modulos[s.modulo] === false && !acessoTotal;
                return (
                  <SectionRows
                    key={s.modulo}
                    title={s.title}
                    items={s.items}
                    disabled={fixed || off}
                    offNote={off ? "Módulo desligado" : undefined}
                    value={value}
                    role={role}
                    onSet={set}
                    onSetAll={(lvl) => setSection(s.items, lvl)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Consulta: só vê. Inclusão: cria novos. Alteração: cria e edita. Total: também exclui.
        </p>
      </div>
    </div>
  );
}

function onSetSafe(disabled: boolean, fn: () => void) {
  if (!disabled) fn();
}

function SectionRows({
  title, items, disabled, offNote, value, role, onSet, onSetAll,
}: {
  title: string;
  items: readonly ModuleKey[];
  disabled: boolean;
  offNote?: string;
  value: PermissionsMap;
  role: CompanyRole;
  onSet: (m: ModuleKey, l: PermissionLevel) => void;
  onSetAll: (l: PermissionLevel) => void;
}) {
  return (
    <>
      <tr className="border-t bg-muted/30">
        <td className="px-3 py-1.5 text-xs font-semibold">
          {title} {offNote && <span className="font-normal text-muted-foreground">— {offNote}</span>}
        </td>
        {LEVELS.map((l) => (
          <td key={l.value} className="text-center">
            {!disabled && (
              <button type="button" className="text-[10px] text-primary hover:underline" onClick={() => onSetAll(l.value)}>
                todos
              </button>
            )}
          </td>
        ))}
      </tr>
      {items.map((m) => {
        const current: PermissionLevel =
          role === "owner" || role === "admin" ? "total"
            : disabled && offNote ? "none"
            : normalizeLevel(value[m] as string) ?? "none";
        return (
          <tr key={m} className="border-t">
            <td className="px-3 py-1.5">{MODULE_LABELS[m]}</td>
            {LEVELS.map((l) => (
              <td key={l.value} className="text-center">
                <input
                  type="radio"
                  aria-label={`${MODULE_LABELS[m]}: ${l.label}`}
                  name={`perm-${m}`}
                  checked={current === l.value}
                  disabled={disabled}
                  onChange={() => onSet(m, l.value)}
                  className={cn("h-3.5 w-3.5 accent-primary", disabled && "opacity-60")}
                />
              </td>
            ))}
          </tr>
        );
      })}
    </>
  );
}
