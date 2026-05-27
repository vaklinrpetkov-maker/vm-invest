import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "vminvest ERP",
  description: "Вътрешна система за управление на vminvest",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="bg">
      <body>{children}</body>
    </html>
  );
}
