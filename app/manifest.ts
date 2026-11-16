import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Daily Logical Reasoning",
    short_name: "Daily LR",
    description: "One LSAT-style Logical Reasoning question a day.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f3efe6",
    theme_color: "#1c1915",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
