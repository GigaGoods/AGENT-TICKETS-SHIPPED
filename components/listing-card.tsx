import Link from "next/link";
import { formatEventDate, timeAgo, type Listing } from "@/lib/store";
import { CalendarIcon, PinIcon } from "@/components/icons";

interface ListingCardProps {
  listing: Listing;
  isNew?: boolean;
  showBuy?: boolean;
}

// Only render this from client components after mount: timeAgo() depends on
// the clock and the listing data itself comes from localStorage.
export function ListingCard({ listing, isNew = false, showBuy = true }: ListingCardProps) {
  const badge =
    listing.status === "escrow" ? (
      <span className="badge badge-coral">In escrow</span>
    ) : listing.source === "agent" ? (
      <span className="badge badge-agent">Agent listed</span>
    ) : (
      <span className="badge badge-human">Human listed</span>
    );

  return (
    <article className={`card lift listing${isNew ? " new" : ""}`}>
      <div className="listing-top">
        <h3>{listing.event}</h3>
        <span className="badge-stack">
          {listing.verified && <span className="badge badge-teal">✓ Doc verified</span>}
          {badge}
        </span>
      </div>
      <p className="listing-meta">
        <span>
          <CalendarIcon />
          {formatEventDate(listing.date)}
        </span>
        <span>
          <PinIcon />
          {listing.venue}
        </span>
      </p>
      <div className="listing-foot">
        <span className="price">
          {listing.price} <small>USDC</small>
        </span>
        <span className="listing-time">
          {listing.source === "agent" && listing.agent ? `via ${listing.agent}, ` : ""}
          {timeAgo(listing.ts)}
        </span>
      </div>
      {showBuy && listing.status !== "escrow" && (
        <Link className="btn btn-secondary btn-sm" href={`/buy?id=${listing.id}`}>
          Buy in escrow
        </Link>
      )}
    </article>
  );
}
