// Notifications domain module — fictional travel booking platform.
//
// Responsibility: outbound notifications (email/SMS placeholders) reacting
// to domain events (booking confirmed, order refunded, etc.).
// Public surface (planned):
//   - internal-only event handlers; no public HTTP endpoints by default.
//
// Strong candidate for Phase 3 extraction, since it is naturally async.
//
// TODO: define an event contract in packages/contracts and consume it here.

export class NotificationsModule {}
