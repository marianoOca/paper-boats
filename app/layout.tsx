import type { Metadata, Viewport } from "next";
import "./globals.css";
import { OrientationGate } from "../components/ui/OrientationGate";
import { FullscreenButton } from "../components/ui/FullscreenButton";
import { MuteButton } from "../components/ui/MuteButton";

export const metadata: Metadata = {
  title: "Paper Armada",
  description: "Online multiplayer paper-boat cannon battle.",
  appleWebApp: { capable: true, title: "Paper Armada", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <main>{children}</main>
        <OrientationGate />
        <div style={{ position: "fixed", top: 12, right: 12, zIndex: 30, display: "flex", gap: 8 }}>
          <MuteButton />
          <FullscreenButton />
        </div>
      </body>
    </html>
  );
}
