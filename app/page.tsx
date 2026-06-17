"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Landing } from "../components/ui/Landing";
import { useLobbyStore } from "../game/state/lobbyStore";

export default function LandingPage() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  // Single fixed room: a returning player (remembered name, same as the persisted
  // clientId) skips this splash and goes straight to /room/GAME, where they auto-rejoin
  // a live match / leaderboard or land in the lobby — no name re-entry. Reopening the
  // app at "/" therefore resumes just like reopening the room URL directly. Only a
  // first-time visitor (no saved name) sees the name entry below.
  useEffect(() => {
    if (localStorage.getItem("pa_name")) {
      router.replace("/room/GAME");
    } else {
      setChecked(true);
    }
  }, [router]);

  if (!checked) return null;

  return (
    <Landing
      onPlay={(name) => {
        useLobbyStore.getState().setPendingName(name);
        router.push("/room/GAME");
      }}
    />
  );
}
