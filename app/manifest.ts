import type { MetadataRoute } from "next";

// Lets phones install the game to the home screen. On iPhone that is the only way
// to get fullscreen: Safari has no Fullscreen API there.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Paper Armada",
    short_name: "Paper Armada",
    start_url: "/",
    display: "fullscreen",
    orientation: "landscape",
    background_color: "#0b1d28",
    theme_color: "#0b1d28",
    icons: [{ src: "/icon.png", sizes: "597x597", type: "image/png" }],
  };
}
