import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
import "./globals.css";
import "./studio.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});
const display = Manrope({ variable: "--font-display", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "SCORM Studio · Tu contenido, nuevas posibilidades", template: "%s · SCORM Studio" },
  description: "Transforma tu PDF en quiz, ruleta, línea de tiempo o simulación. Revisa tu actividad y expórtala como SCORM 1.2 para Moodle. Proyecto independiente para docentes.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${inter.variable} ${display.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
