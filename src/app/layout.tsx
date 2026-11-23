import type { Metadata, Viewport } from "next";
import { Fraunces, Manjari, Nunito_Sans } from "next/font/google";
import { Providers } from "@/components/Providers";
import "./globals.css";

const nunito = Nunito_Sans({
  variable: "--font-nunito-sans",
  subsets: ["latin"],
  display: "swap",
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
});

const manjari = Manjari({
  variable: "--font-manjari",
  subsets: ["malayalam"],
  weight: ["400", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Veedu · വീട്",
  description: "Our home, Harsh and Prerna's.",
  appleWebApp: { capable: true, title: "Veedu", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F6F1E7",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${nunito.variable} ${fraunces.variable} ${manjari.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
