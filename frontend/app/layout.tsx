import type { Metadata } from "next";
import Script from "next/script";
import { IBM_Plex_Sans } from "next/font/google";
import { Toaster } from "@/components/toaster";
import { AuthProvider } from "@/lib/auth";
import "./globals.css";

const plex = IBM_Plex_Sans({
  variable: "--font-plex",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

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
    <html lang="en" className={`${plex.variable} h-full antialiased`}>
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
