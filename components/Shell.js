import { currentUser } from "@/lib/auth";
import { get } from "@/lib/db";
import AppChrome from "./AppChrome";
const base = [
  ["/", "⌂", "Inicio"],
  ["/revision", "✓", "Revisar pendientes"],
  ["/encuestas", "▤", "Buscar encuestas"],
  ["/reportes", "▥", "Reportes"],
  ["/carga", "⇧", "Escanear o cargar"],
  ["/alertas", "!", "Alertas"],
  ["/areas", "⌘", "Áreas"],
  ["/usuarios", "♙", "Usuarios"],
  ["/auditoria", "◉", "Auditoría"],
];
export default async function Shell({ children, active = "/" }) {
  const user = await currentUser();
  const unread = user ? Number((await get("SELECT count(*)::int n FROM notifications WHERE user_id=? AND read_at IS NULL", user.id))?.n || 0) : 0;
  const nav = base
    .filter(([href]) => href !== "/usuarios" || user?.role === "admin")
    .filter(
      ([href]) =>
        href !== "/auditoria" ||
        user?.role === "admin",
    );
  return <AppChrome nav={nav} active={active} unread={unread} user={user}>{children}</AppChrome>;
}
