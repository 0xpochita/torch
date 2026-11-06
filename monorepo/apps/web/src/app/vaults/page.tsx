import { Suspense } from "react";
import { Topbar } from "@/components/navbar";
import { Vaults } from "./vaults";

export const metadata = { title: "My Vaults · Torch" };

// Suspense: the dev-only ?as= override reads search params, which are request-time data.
export default function VaultsPage() {
  return (
    <Suspense fallback={<Topbar />}>
      <Vaults />
    </Suspense>
  );
}
