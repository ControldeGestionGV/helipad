import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Helipad Booking",
    short_name: "Helipad",
    description: "Book your helipad time slots easily and efficiently",
    start_url: "/bookings/calendar",
    display: "standalone",
    background_color: "#fafafa",
    theme_color: "#1E2158",
    orientation: "portrait-primary",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/icons/icon-192x192.svg",
        sizes: "192x192",
        type: "image/svg+xml",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512x512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
    screenshots: [],
    shortcuts: [
      {
        name: "New Booking",
        short_name: "Book",
        description: "Create a new helipad booking",
        url: "/bookings/calendar",
      },
      {
        name: "My Bookings",
        short_name: "Bookings",
        description: "View your bookings",
        url: "/bookings/my-bookings",
      },
    ],
  };
}

