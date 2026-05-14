"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { changeMyPassword, updateMyProfile } from "./actions";

export function ProfileForm({
  initial,
}: {
  initial: {
    first_name: string;
    last_name: string;
    phone: string | null;
    email: string;
    role: string;
  };
}) {
  const router = useRouter();
  const [firstName, setFirstName] = useState(initial.first_name);
  const [lastName, setLastName] = useState(initial.last_name);
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [pending, startTransition] = useTransition();

  const [pwd, setPwd] = useState("");
  const [pwdConfirm, setPwdConfirm] = useState("");
  const [pwdPending, startPwdTransition] = useTransition();

  function saveBasics() {
    startTransition(async () => {
      const result = await updateMyProfile({
        first_name: firstName,
        last_name: lastName,
        phone,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Perfil actualizado");
      router.refresh();
    });
  }

  function savePassword() {
    startPwdTransition(async () => {
      const result = await changeMyPassword({
        password: pwd,
        confirm: pwdConfirm,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Contraseña actualizada");
      setPwd("");
      setPwdConfirm("");
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Datos básicos</h2>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pf-first">Nombre</Label>
            <Input
              id="pf-first"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pf-last">Apellido</Label>
            <Input
              id="pf-last"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pf-email">Email</Label>
          <Input id="pf-email" value={initial.email} disabled />
          <p className="text-xs text-muted-foreground">
            El email no se puede modificar.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pf-role">Rol</Label>
          <Input id="pf-role" value={initial.role} disabled />
          <p className="text-xs text-muted-foreground">
            Tu rol lo gestiona el SuperAdmin / Admin / Gerente según
            corresponda.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pf-phone">Teléfono</Label>
          <Input
            id="pf-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        <Button onClick={saveBasics} disabled={pending} className="self-start">
          {pending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Cambiar contraseña</h2>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pf-pwd">Nueva contraseña</Label>
          <Input
            id="pf-pwd"
            type="password"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            minLength={8}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pf-pwd-confirm">Repetir contraseña</Label>
          <Input
            id="pf-pwd-confirm"
            type="password"
            value={pwdConfirm}
            onChange={(e) => setPwdConfirm(e.target.value)}
            minLength={8}
          />
        </div>
        <Button
          onClick={savePassword}
          disabled={pwdPending || !pwd}
          className="self-start"
        >
          {pwdPending ? "Guardando…" : "Cambiar contraseña"}
        </Button>
      </div>
    </div>
  );
}
