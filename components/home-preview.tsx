"use client";

import { useListings } from "@/lib/use-listings";
import { ListingCard } from "@/components/listing-card";

export function HomePreview() {
  const { listings } = useListings();

  return (
    <div className="listing-grid">
      {(listings ?? []).slice(0, 3).map((listing) => (
        <ListingCard key={listing.id} listing={listing} />
      ))}
    </div>
  );
}
