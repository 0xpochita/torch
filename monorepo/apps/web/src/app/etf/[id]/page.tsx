import { Suspense } from "react";
import { VaultDetail, VaultSkeleton } from "./vault";

export default function EtfPage({ params }: PageProps<"/etf/[id]">) {
  return <Suspense fallback={<VaultSkeleton />}>{params.then(({ id }) => <VaultDetail id={id} />)}</Suspense>;
}
