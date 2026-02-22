import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pre-VD Identifier Admin",
  description: "CSV import and Gemini-based classification admin",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
