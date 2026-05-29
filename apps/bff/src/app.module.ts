// Root composition for the modular monolith.
//
// Inter-module rule (will be lint-enforced later): modules MUST depend only
// on other modules' public exports (services exported via `exports: [...]`),
// never on their internal classes. This is what keeps Phase 3 extraction
// mechanical instead of structural.
//
// Not yet wired here: CustomersModule, NotificationsModule (placeholders only).

import { Module } from "@nestjs/common";
import { CartModule } from "./modules/cart/cart.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { CheckoutModule } from "./modules/checkout/checkout.module";
import { HealthModule } from "./modules/health/health.module";
import { OrdersModule } from "./modules/orders/orders.module";
import { VisualizationEventsModule } from "./modules/visualization/visualization-events.module";
import { VisualizationModule } from "./modules/visualization/visualization.module";
import { PrismaModule } from "./prisma.module";

@Module({
  imports: [
    PrismaModule,
    VisualizationEventsModule,
    HealthModule,
    CatalogModule,
    CartModule,
    CheckoutModule,
    OrdersModule,
    VisualizationModule,
  ],
})
export class AppModule {}
