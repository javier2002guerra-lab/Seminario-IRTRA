import Shell from "@/components/Shell";
import { currentUser } from "@/lib/auth";
import PasswordForm from "./password-form";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const user = await currentUser();
  return (
    <Shell active="/seguridad">
      <div className="eyebrow">Cuenta institucional</div>
      <h1 className="title">Seguridad de la cuenta</h1>
      <p className="subtitle">Administra tu contraseña y verifica el estado del segundo factor.</p>
      <PasswordForm mfaEnabled={Boolean(user?.mfa_enabled)} />
    </Shell>
  );
}
