import "./globals.css";
import "./irtra-theme.css";
import "./background-fit.css";
import "./review-workspace.css";
import "./digital-sheet.css";
import "./enterprise.css";
export const metadata = {
  title: "IRTRA Gestión de Encuestas",
  description: "Gestión inteligente y segura de encuestas",
};
export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
