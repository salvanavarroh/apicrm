"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

import { changeMyPassword, updateMyAvatar, updateMyProfile } from "./actions";

export function ProfileForm({
  initial,
}: {
  initial: {
    id: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    email: string;
    role: string;
    avatar_url: string | null;
  };
}) {
  const router = useRouter();
  const [firstName, setFirstName] = useState(initial.first_name);
  const [lastName, setLastName] = useState(initial.last_name);
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [avatarUrl, setAvatarUrl] = useState(initial.avatar_url);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("El archivo debe ser una imagen");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("La imagen no puede superar 5 MB");
      return;
    }
    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      // El path arranca con el uid para cumplir la RLS del bucket.
      const path = `${initial.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });
      if (upErr) {
        toast.error(`No se pudo subir: ${upErr.message}`);
        return;
      }
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = data.publicUrl;
      const res = await updateMyAvatar(publicUrl);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      setAvatarUrl(publicUrl);
      toast.success("Foto actualizada");
      router.refresh();
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function removeAvatar() {
    startTransition(async () => {
      const res = await updateMyAvatar(null);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      setAvatarUrl(null);
      toast.success("Foto eliminada");
      router.refresh();
    });
  }

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
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Datos básicos</h2>

        <div className="flex items-center gap-4">
          <UserAvatar
            firstName={firstName}
            lastName={lastName}
            email={initial.email}
            avatarUrl={avatarUrl}
            size="xl"
          />
          <div className="flex flex-col gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onPickFile}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? "Subiendo…" : "Cambiar foto"}
              </Button>
              {avatarUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending || uploading}
                  onClick={removeAvatar}
                  className="text-destructive"
                >
                  Quitar
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              JPG o PNG, hasta 5 MB.
            </p>
          </div>
        </div>

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
