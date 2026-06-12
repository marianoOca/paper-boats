import type { Metadata, Viewport } from "next";
import "./globals.css";
import { OrientationGate } from "../components/ui/OrientationGate";
import { FullscreenButton } from "../components/ui/FullscreenButton";

export const metadata: Metadata = {
  title: "Paper Armada",
  description: "Online multiplayer paper-boat cannon battle.",
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
        <FullscreenButton />
      </body>
    </html>
  );
}
