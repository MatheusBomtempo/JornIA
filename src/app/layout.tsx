import type { Metadata, Viewport } from "next";
import { Inter, Poppins } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

// Poppins é a fonte da arte — usada no preview do editor para bater
// exatamente com o render do servidor.
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-art",
});

export const metadata: Metadata = {
  title: "JornIA — publicação rápida no Instagram com IA",
  description:
    "Da fonte ao feed em minutos: IA redige o texto, o jornalista ajusta a arte e o editor aprova antes de publicar no Instagram.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0c10",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={`dark ${inter.variable} ${poppins.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
