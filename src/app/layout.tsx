import type { Metadata, Viewport } from "next";
import { Inter, Poppins } from "next/font/google";
import { getServerDictionary } from "@/lib/i18n/server";
import { LocaleProvider } from "@/components/LocaleProvider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

// Poppins é a fonte da arte — usada no preview do editor para bater
// exatamente com o render do servidor.
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-art",
});

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await getServerDictionary();
  return {
    title: dict.rootMetadata.title,
    description: dict.rootMetadata.description,
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0c10",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { locale } = await getServerDictionary();
  return (
    <html
      lang={locale === "pt" ? "pt-BR" : "en"}
      className={`dark ${inter.variable} ${poppins.variable}`}
    >
      <body className="font-sans antialiased">
        <LocaleProvider initialLocale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
