import type { Metadata } from "next";
import { Bricolage_Grotesque, Geist_Mono, Golos_Text } from "next/font/google";
import { Sidebar, TabBar } from "@/components/navbar";
import { THEME_SCRIPT } from "@/components/theme-toggle";
import "./globals.css";

// SF Pro (system) for UI with Golos as fallback, Bricolage Grotesque for chunky display titles.
const golos = Golos_Text({
  variable: "--font-golos",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["700", "800"],
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
    <html lang="en" suppressHydrationWarning className={`${golos.variable} ${bricolage.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col px-3 pb-28 md:px-8 md:pb-8">{children}</div>
        </div>
        <TabBar />
      </body>
    </html>
  );
}
