import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { UIProvider } from "@/components/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: "Container & Document Tracking System",
  description: "Track containers, IM7/IM4/Exit documents, expiry dates, workflow stages, reports and email alerts.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-100 text-slate-900 antialiased">
        <UIProvider>{children}</UIProvider>
      </body>
    </html>
  );
}
