import type { Metadata } from "next";
import { SellClient } from "./sell-client";

export const metadata: Metadata = {
  title: "List a ticket",
};

export default function SellPage() {
  return <SellClient />;
}
