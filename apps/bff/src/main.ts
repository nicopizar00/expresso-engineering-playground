// TODO: Bootstrap the NestJS application here.
//
// Expected wiring for the next iteration:
//   1. Initialize OpenTelemetry SDK *before* importing NestFactory so HTTP and
//      DB instrumentations attach correctly.
//   2. Create the app from AppModule (see ./app.module.ts).
//   3. Apply global pipes (ValidationPipe), interceptors (logging), and
//      filters (problem+json error mapper).
//   4. Mount Swagger at /docs sourced from packages/contracts.
//   5. Listen on PORT (default 3001) — never hardcode a URL.
//
// Kept as a no-op so this file remains a typed, lint-clean placeholder.
export async function bootstrap(): Promise<void> {
  // Intentionally empty — see TODOs above.
}

if (require.main === module) {
  void bootstrap();
}
