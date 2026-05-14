// TODO: Compose feature modules here once NestJS is wired.
// This file documents the intended module graph for the modular monolith.
//
// Planned imports (Phase 1):
//   - TripsModule
//   - BookingModule
//   - OrdersModule
//   - UsersModule
//   - NotificationsModule
//
// Inter-module communication rule (enforced later by lint):
//   Modules MUST depend only on other modules' public interfaces, never on
//   their internal services, repositories, or entities. This is what keeps
//   extraction to a separate service mechanical instead of structural.

export class AppModule {}
