import { cn } from "@/lib/utils";

type Role =
  | "admin"
  | "manager"
  | "supervisor"
  | "sales"
  | "data_provider"
  | "super_admin";

type Props = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  role?: Role | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
};

const SIZE_CLS = {
  sm: "size-7 text-[10px]",
  md: "size-9 text-xs",
  lg: "size-11 text-sm",
  xl: "size-14 text-base",
} as const;

// Fondo coloreado por rol — sirve como diferenciador rápido entre Gerente
// y Proveedor en la tabla de Usuarios cuando hay solo iniciales.
const ROLE_BG: Record<Role, string> = {
  super_admin: "bg-purple-500/15 text-purple-700",
  admin: "bg-amber-500/15 text-amber-700",
  manager: "bg-accent/15 text-accent",
  supervisor: "bg-teal-500/15 text-teal-700",
  sales: "bg-emerald-500/15 text-emerald-700",
  data_provider: "bg-blue-500/15 text-blue-700",
};

/**
 * Avatar circular con iniciales del nombre. Si hay avatarUrl, muestra la
 * imagen. El color de fondo (cuando no hay foto) viene del rol — ayuda a
 * distinguir gerente / proveedor / vendedor de un vistazo.
 */
export function UserAvatar({
  firstName,
  lastName,
  email,
  avatarUrl,
  role,
  size = "md",
  className,
}: Props) {
  const sizeCls = SIZE_CLS[size];
  const initials = computeInitials(firstName, lastName, email);
  const bg = role ? ROLE_BG[role] : "bg-muted text-muted-foreground";

  if (avatarUrl) {
    return (
      <span
        className={cn(
          "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
          sizeCls,
          className,
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatarUrl}
          alt={initials}
          className="h-full w-full object-cover"
        />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-tight",
        sizeCls,
        bg,
        className,
      )}
      aria-label={initials}
    >
      {initials}
    </span>
  );
}

function computeInitials(
  firstName?: string | null,
  lastName?: string | null,
  email?: string | null,
): string {
  const f = (firstName ?? "").trim().charAt(0).toUpperCase();
  const l = (lastName ?? "").trim().charAt(0).toUpperCase();
  if (f && l) return f + l;
  if (f) return f;
  if (l) return l;
  if (email) {
    const e = email.trim().charAt(0).toUpperCase();
    if (e) return e;
  }
  return "U";
}
