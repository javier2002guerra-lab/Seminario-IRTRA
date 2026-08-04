import "./globals.css";
import "./irtra-theme.css";
import "./background-fit.css";
import "./review-workspace.css";
import "./digital-sheet.css";
import "./enterprise.css";
import "./support.css";
import "./executive.css";
export const metadata = {
  title: "IRTRA Gestión de Encuestas",
  description: "Gestión inteligente y segura de encuestas",
};
export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body><a className="skip-link" href="#main-content">Saltar al contenido principal</a>{children}</body>
    </html>
  );
}
