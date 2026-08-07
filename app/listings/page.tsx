import type { Metadata } from "next";
import { ListingsClient } from "./listings-client";

export const metadata: Metadata = {
  title: "Live listings",
};

export default function ListingsPage() {
  return <ListingsClient />;
}
