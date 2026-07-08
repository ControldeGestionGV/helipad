// App constants
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Helipad Booking";
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

// Time slot configuration
export const TIME_SLOT_DURATION = 15; // minutes
export const DEFAULT_START_HOUR = 6; // 6 AM
export const DEFAULT_END_HOUR = 22; // 10 PM

// Booking constraints
export const MIN_BOOKING_NOTICE = 60; // minutes before booking starts
export const MAX_BOOKING_DURATION = 240; // minutes (4 hours)
export const CANCELLATION_CUTOFF = 60; // minutes before booking starts

// Pagination defaults
export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;

// Colors for calendar
export const CALENDAR_COLORS = {
  available: "bg-emerald-100 border-emerald-300 hover:bg-emerald-200",
  myBooking: "bg-sky-100 border-sky-400 text-sky-900",
  othersBooking: "bg-zinc-100 border-zinc-300 text-zinc-600",
  past: "bg-zinc-50 text-zinc-400",
  blackout: "bg-red-50 border-red-200 text-red-400",
} as const;

// Status colors
export const STATUS_COLORS = {
  confirmed: "bg-emerald-100 text-emerald-800 border-emerald-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
  active: "bg-emerald-100 text-emerald-800",
  inactive: "bg-zinc-100 text-zinc-600",
} as const;

// Role colors
export const ROLE_COLORS = {
  admin: "bg-brand-100 text-brand-800",
  user: "bg-blue-100 text-blue-800",
} as const;

// Routes
export const ROUTES = {
  home: "/",
  login: "/login",
  dashboard: "/bookings/calendar",
  calendar: "/bookings/calendar",
  myBookings: "/bookings/my-bookings",
  newBooking: "/bookings/new",
  adminDashboard: "/admin",
  adminOperation: "/admin/operation",
  adminUsers: "/admin/users",
  adminBookings: "/admin/bookings",
  adminSettings: "/admin/settings",
  adminEmail: "/admin/email",
} as const;

// Navigation items
export const NAV_ITEMS = {
  user: [
    { label: "Calendar", href: ROUTES.calendar, icon: "Calendar" },
    { label: "My Bookings", href: ROUTES.myBookings, icon: "ListOrdered" },
  ],
  admin: [
    { label: "Users", href: ROUTES.adminUsers, icon: "Users" },
    { label: "Bookings", href: ROUTES.adminBookings, icon: "ClipboardList" },
    { label: "Settings", href: ROUTES.adminSettings, icon: "Settings" },
  ],
} as const;
