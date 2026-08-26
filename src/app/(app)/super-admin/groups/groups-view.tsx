"use client";

import { Building2, Plus, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  createGroup,
  inviteGroupAdmin,
  setCompanyGroup,
} from "@/app/(app)/super-admin/groups/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type GroupRow = {
  id: string;
  name: string;
  legalName: string | null;
  cuit: string | null;
  monthlyPrice: number;
  billingContactName: string | null;
  billingEmail: string | null;
  brands: { id: string; name: string }[];
  admins: { id: string; name: string; status: string }[];
};

export type FreeCompany = { id: string; name: string };

function money(n: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n || 0);
}

export function GroupsView({
  groups,
  freeCompanies,
}: {
  groups: GroupRow[];
  freeCompanies: FreeCompany[];
}) {
  const [creating, setCreating] = useState(false);
  const [invitingFor, setInvitingFor] = useState<GroupRow | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function assign(companyId: string, groupId: string | null) {
    start(async () => {
      const res = await setCompanyGroup(companyId, groupId);
      if (res.ok) {
        toast.success(groupId ? "Marca agregada al grupo" : "Marca sacada del grupo");
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end">
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="mr-2 size-4" /> Nuevo grupo
        </Button>
      </div>

      {groups.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="font-medium">Todavía no hay grupos</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Un grupo junta varias concesionarias bajo un mismo dueño y un mismo
            contrato: el dueño entra con una sola cuenta y cambia de marca desde
            el menú.
          </p>
        </Card>
      ) : (
        groups.map((g) => (
          <Card key={g.id} className="flex flex-col gap-4 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <Building2 className="size-4 text-accent" />
                  {g.name}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {g.legalName ?? "Sin razón social"}
                  {g.cuit ? ` · CUIT ${g.cuit}` : ""}
                  {" · "}
                  {money(g.monthlyPrice)}/mes
                  {g.billingEmail ? ` · factura a ${g.billingEmail}` : ""}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setInvitingFor(g)}>
                <UserPlus className="mr-2 size-3.5" /> Invitar admin del grupo
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Marcas ({g.brands.length})
                </h3>
                {g.brands.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Sin marcas asignadas todavía.
                  </p>
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {g.brands.map((b) => (
                      <li
                        key={b.id}
                        className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs"
                      >
                        {b.name}
                        <button
                          type="button"
                          title="Sacar del grupo"
                          disabled={pending}
                          onClick={() => assign(b.id, null)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="size-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {freeCompanies.length > 0 && (
                  <div className="mt-3 flex items-center gap-2">
                    <Select onValueChange={(v) => assign(v, g.id)} disabled={pending}>
                      <SelectTrigger className="h-8 w-64 text-xs">
                        <SelectValue placeholder="Agregar una concesionaria…" />
                      </SelectTrigger>
                      <SelectContent>
                        {freeCompanies.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Admins del grupo ({g.admins.length})
                </h3>
                {g.admins.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nadie invitado todavía. Sin un admin, el grupo no tiene quién
                    lo mire.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {g.admins.map((a) => (
                      <li key={a.id} className="flex items-center gap-2 text-xs">
                        <span className="font-medium">{a.name}</span>
                        <span
                          className={
                            a.status === "active"
                              ? "rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] text-success"
                              : "rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                          }
                        >
                          {a.status === "pending" ? "invitación pendiente" : a.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Card>
        ))
      )}

      <CreateGroupDialog open={creating} onClose={() => setCreating(false)} />
      <InviteAdminDialog group={invitingFor} onClose={() => setInvitingFor(null)} />
    </div>
  );
}

function CreateGroupDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    legal_name: "",
    cuit: "",
    monthly_price: "",
    billing_contact_name: "",
    billing_email: "",
  });
  const [pending, start] = useTransition();
  const router = useRouter();

  const set = (k: keyof typeof form, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  function submit() {
    start(async () => {
      const res = await createGroup({
        ...form,
        monthly_price: form.monthly_price === "" ? 0 : Number(form.monthly_price),
      });
      if (res.ok) {
        toast.success("Grupo creado");
        setForm({
          name: "",
          legal_name: "",
          cuit: "",
          monthly_price: "",
          billing_contact_name: "",
          billing_email: "",
        });
        onClose();
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo grupo</DialogTitle>
          <DialogDescription>
            El contrato es del grupo: un precio acordado y una sola factura. Las
            marcas que se le agreguen quedan sin precio propio.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nombre del grupo" className="sm:col-span-2">
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Grupo Navarro"
            />
          </Field>
          <Field label="Razón social">
            <Input
              value={form.legal_name}
              onChange={(e) => set("legal_name", e.target.value)}
            />
          </Field>
          <Field label="CUIT">
            <Input value={form.cuit} onChange={(e) => set("cuit", e.target.value)} />
          </Field>
          <Field label="Precio mensual (ARS)">
            <Input
              type="number"
              value={form.monthly_price}
              onChange={(e) => set("monthly_price", e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Contacto de facturación">
            <Input
              value={form.billing_contact_name}
              onChange={(e) => set("billing_contact_name", e.target.value)}
            />
          </Field>
          <Field label="Email de facturación" className="sm:col-span-2">
            <Input
              type="email"
              value={form.billing_email}
              onChange={(e) => set("billing_email", e.target.value)}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending || form.name.trim().length < 2}>
            {pending ? "Creando…" : "Crear grupo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InviteAdminDialog({
  group,
  onClose,
}: {
  group: GroupRow | null;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    email: "",
    first_name: "",
    last_name: "",
    phone: "",
  });
  const [pending, start] = useTransition();
  const router = useRouter();

  const set = (k: keyof typeof form, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  function submit() {
    if (!group) return;
    start(async () => {
      const res = await inviteGroupAdmin(group.id, form);
      if (res.ok) {
        toast.success(`Invitación enviada a ${res.email}`);
        setForm({ email: "", first_name: "", last_name: "", phone: "" });
        onClose();
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  }

  return (
    <Dialog open={group != null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Admin del grupo</DialogTitle>
          <DialogDescription>
            Una sola cuenta con acceso de Admin a todas las marcas de{" "}
            {group?.name}. Cambia de marca desde el menú.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nombre">
            <Input
              value={form.first_name}
              onChange={(e) => set("first_name", e.target.value)}
            />
          </Field>
          <Field label="Apellido">
            <Input
              value={form.last_name}
              onChange={(e) => set("last_name", e.target.value)}
            />
          </Field>
          <Field label="Email" className="sm:col-span-2">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </Field>
          <Field label="Teléfono" className="sm:col-span-2">
            <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending || !form.email.includes("@")}>
            {pending ? "Enviando…" : "Enviar invitación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
