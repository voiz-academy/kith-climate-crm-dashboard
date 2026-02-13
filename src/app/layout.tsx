import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AccessGate } from "@/components/AccessGate";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Kith Climate CRM Dashboard",
  description: "Workshop leads segmentation and analysis",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased`}>
        <AccessGate>
          {children}
        </AccessGate>
      </body>
    </html>
  );
}
