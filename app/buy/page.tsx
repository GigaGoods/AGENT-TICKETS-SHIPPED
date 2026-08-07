import type { Metadata } from "next";
import { Suspense } from "react";
import { BuyClient } from "./buy-client";

export const metadata: Metadata = {
  title: "Buy in escrow",
};

export default function BuyPage() {
  return (
    <Suspense>
      <BuyClient />
    </Suspense>
  );
}
