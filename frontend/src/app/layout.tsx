import type { Metadata } from "next";
import "./globals.css";
import { ConfirmDialogProvider } from "@/components/providers/confirm-dialog-provider";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth";

export const metadata: Metadata = {
  title: "PrimeFlow",
  description: "Internal task & project management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AuthProvider>
          <ConfirmDialogProvider>
            {children}
            <Toaster />
          </ConfirmDialogProvider>
        </AuthProvider>
      </body>
    </html>
  );
}


