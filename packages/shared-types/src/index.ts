// Cross-cutting domain types for the fictional travel booking platform.
// Keep this surface small. Anything wire-format belongs in @travel-playground/contracts.

export type TripId = string & { readonly __brand: "TripId" };
export type BookingId = string & { readonly __brand: "BookingId" };
export type OrderId = string & { readonly __brand: "OrderId" };
export type UserId = string & { readonly __brand: "UserId" };

export type Money = {
  readonly amountMinor: number;
  readonly currency: string;
};

export type BookingStatus = "held" | "confirmed" | "cancelled";
export type OrderStatus = "pending" | "paid" | "refunded" | "failed";

// TODO: add Trip, TripLeg, Traveler, NotificationChannel types as the
// domain modules grow.
