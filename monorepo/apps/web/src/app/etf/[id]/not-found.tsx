import Link from "next/link";
import { Topbar } from "@/components/navbar";

export default function NotFound() {
  return (
    <>
      <Topbar />
      <div className="grid flex-1 place-items-center py-24 text-center">
        <div className="flex max-w-sm flex-col items-center gap-3">
          <span className="grid size-14 place-items-center rounded-2xl bg-panel text-2xl">◇</span>
          <h1 className="text-xl font-semibold">Vault not found</h1>
          <p className="text-sm text-muted">No ETF NFT exists with this id. It may not be minted yet.</p>
          <Link href="/" className="btn-ink mt-2 px-5 py-2.5 text-sm">
            Back to Explore
          </Link>
        </div>
      </div>
    </>
  );
}
