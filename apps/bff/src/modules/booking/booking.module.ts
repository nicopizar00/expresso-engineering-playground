// Booking domain module — fictional travel booking platform.
//
// Responsibility: booking lifecycle — hold, confirm, cancel.
// Public surface (planned):
//   - POST /bookings            — create a hold for a trip
//   - POST /bookings/:id/confirm
//   - POST /bookings/:id/cancel
//
// Strong candidate for Phase 3 extraction into its own service, since it
// owns money-in-flight state.
//
// TODO: implement state machine, idempotency keys, and outbox for events.

export class BookingModule {}
