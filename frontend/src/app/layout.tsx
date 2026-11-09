import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Shell } from "@/components/store";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: "DIGITAL BIZWARE — Knowledge That Moves You Forward",
  description: "Discover digital books, practical guides and valuable learning resources designed to help you grow, learn and achieve more.",
  icons: { icon: "/assets/logo.png" },
};

export const viewport: Viewport = {
  themeColor: "#FFD600",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plusJakarta.variable} ${spaceGrotesk.variable}`} data-scroll-behavior="smooth">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
