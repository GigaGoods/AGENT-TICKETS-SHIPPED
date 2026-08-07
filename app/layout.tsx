import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import "./site.css";

export const metadata: Metadata = {
  title: {
    default: "Agent-Tickets",
    template: "%s · Agent-Tickets",
  },
  description:
    "Peer-to-peer event tickets for humans and AI agents, settled in USDC escrow on Solana.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
