import { currentUser } from "@/lib/auth";
import { get } from "@/lib/db";
import { redirect } from "next/navigation";
import AppChrome from "./AppChrome";
const base = [
  ["/", "⌂", "Inicio"],
  ["/revision", "✓", "Revisar pendientes"],
  ["/encuestas", "▤", "Buscar encuestas"],
  ["/reportes", "▥", "Reportes"],
  ["/carga", "⇧", "Escanear o cargar"],
  ["/alertas", "!", "Alertas"],
  ["/acciones", "◎", "Planes de acción"],
  ["/areas", "⌘", "Áreas"],
  ["/usuarios", "♙", "Usuarios"],
  ["/auditoria", "◉", "Auditoría"],
  ["/integraciones", "⚙", "Integraciones"],
  ["/seguridad", "◆", "Mi seguridad"],
];
export default async function Shell({ children, active = "/" }) {
  const user = await currentUser();
  if (!user) redirect("/login?reason=session-replaced");
  const unread = Number((await get("SELECT count(*)::int n FROM notifications WHERE user_id=? AND read_at IS NULL", user.id))?.n || 0);
  const nav = base
    .filter(([href]) => !["/usuarios", "/integraciones"].includes(href) || user?.role === "admin")
    .filter(
      ([href]) =>
        href !== "/auditoria" ||
        user?.role === "admin",
    );
  return <AppChrome nav={nav} active={active} unread={unread} user={user}>{children}</AppChrome>;
}
