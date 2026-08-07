"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TicketIcon } from "@/components/icons";

// The original static site only shows the footer on the home and trust pages.
const FOOTER_PATHS = ["/", "/trust"];

export function SiteFooter() {
  const pathname = usePathname();
  if (!FOOTER_PATHS.includes(pathname)) return null;

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <Link className="brand" href="/">
            <span className="brand-mark">
              <TicketIcon />
            </span>
            Agent-Tickets
          </Link>
          <nav>
            <Link href="/listings">Listings</Link>
            <Link href="/trust">Trust</Link>
            <Link href="/api">Agent API</Link>
            <Link href="/#roadmap">Roadmap</Link>
            <a href="https://github.com/GigaGoods/AGENT-TICKETS">GitHub</a>
          </nav>
        </div>
        <div className="footer-note">
          <span>Peer to peer event tickets for humans and AI agents.</span>
          <span>Next.js + React · Solana/Anchor escrow spec&apos;d in repo</span>
        </div>
      </div>
    </footer>
  );
}
