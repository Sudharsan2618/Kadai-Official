import type { Metadata } from "next";
import Script from "next/script";
import { Toaster } from "@/components/toaster";
import { AuthProvider } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kadai — your shop on WhatsApp",
  description: "Sell more on WhatsApp: chats, broadcasts, orders and customers in one place.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <AuthProvider>
          {children}
          <Toaster />
        </AuthProvider>
        {/* Razorpay Checkout — loaded once, used by the billing page. */}
        <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
