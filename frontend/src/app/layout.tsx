import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Shell } from "@/components/store";

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
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
