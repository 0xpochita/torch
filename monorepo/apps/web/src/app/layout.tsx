import type { Metadata } from "next";
import { Geist_Mono, Golos_Text } from "next/font/google";
import { Rail } from "@/components/navbar";
import "./globals.css";

// Same type system as HOT Craft: Golos Text for UI, Geist Mono for numbers/accounts.
const golos = Golos_Text({
  variable: "--font-golos",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Torch — NFT ETFs on NEAR",
  description: "Every NFT is a vault that holds a basket of NEAR tokens. Sell the NFT, sell the basket.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${golos.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full md:p-4">
        <div className="flex min-h-screen bg-bg shadow-[0_30px_80px_-30px_rgb(60_40_120/0.35)] md:min-h-[calc(100vh-2rem)] md:rounded-[28px]">
          <Rail />
          <div className="flex min-w-0 flex-1 flex-col px-4 md:border-l md:border-line-soft md:px-8">{children}</div>
        </div>
      </body>
    </html>
  );
}
