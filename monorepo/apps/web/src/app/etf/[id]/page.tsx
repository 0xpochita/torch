import { Suspense } from "react";
import { VaultDetail, VaultSkeleton } from "./vault";

// Sample param so the shell (and the layout's pathname-aware navbar) prerenders; every other id
// renders on first request. Vault data itself is fetched client-side from the API.
export function generateStaticParams() {
  return [{ id: "0" }];
}

export default function EtfPage({ params }: PageProps<"/etf/[id]">) {
  return <Suspense fallback={<VaultSkeleton />}>{params.then(({ id }) => <VaultDetail id={id} />)}</Suspense>;
}
