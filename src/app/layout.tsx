import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Proventure Lead Extractor",
  description: "Extract and manage local business leads using Google Places and Supabase.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
