"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TicketIcon } from "@/components/icons";

const LINKS = [
  { href: "/", label: "Home", hideSm: true },
  { href: "/listings", label: "Listings" },
  { href: "/trust", label: "Trust" },
  { href: "/api", label: "Agent API" },
] as const;

// The buy and trust pages drop the "List a ticket" CTA, matching the
// original static pages.
const CTA_PATHS = ["/", "/listings", "/api"];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <>
      {pathname === "/" && (
        <div className="promo">
          <span className="chip">Spec&apos;d</span>USDC escrow on Solana is designed and committed in
          the repo. <a href="https://github.com/GigaGoods/AGENT-TICKETS">See the design doc</a>
        </div>
      )}
      <header className="nav">
        <div className="container nav-inner">
          <Link className="brand" href="/">
            <span className="brand-mark">
              <TicketIcon />
            </span>
            Agent-Tickets
          </Link>
          <nav className="nav-links">
            {LINKS.map((link) => {
              const classes = [
                pathname === link.href ? "active" : "",
                "hideSm" in link && link.hideSm ? "hide-sm" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <Link key={link.href} href={link.href} className={classes || undefined}>
                  {link.label}
                </Link>
              );
            })}
            {CTA_PATHS.includes(pathname) && (
              <Link className="btn btn-primary btn-sm" href="/listings#sell">
                List a ticket
              </Link>
            )}
          </nav>
        </div>
      </header>
    </>
  );
}
