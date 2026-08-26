import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://nutricionapp.amartosalmagro.chatgpt.site"),
  title: "NUTRICIONAPP",
  description: "Recetas sencillas, menús equilibrados y lista de la compra en un solo lugar.",
  applicationName: "NUTRICIONAPP",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "NUTRICIONAPP",
  },
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    locale: "es_ES",
    title: "NUTRICIONAPP",
    description: "Recetas sencillas para comer mejor.",
    images: [{ url: "/og.png", width: 1672, height: 941, alt: "NUTRICIONAPP · Recetas sencillas para comer mejor" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "NUTRICIONAPP",
    description: "Recetas sencillas para comer mejor.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/icon-192.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <head>
        <meta name="theme-color" content="#225b4e" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
