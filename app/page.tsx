"use client";
import { useRouter } from "next/navigation";
import { Landing } from "../components/ui/Landing";

export default function LandingPage() {
  const router = useRouter();
  return <Landing onPlay={() => router.push("/room/GAME")} />;
}
