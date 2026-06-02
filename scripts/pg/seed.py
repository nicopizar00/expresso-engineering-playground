"""seed — run prisma db seed inside a one-off dev-stage BFF container."""

from __future__ import annotations

from pg import compose
from pg.ansi import header, info, pass_


def run() -> int:
    header("Seed")
    info("Running prisma db seed...")
    compose.run_bff_dev(
        ["pnpm", "--filter", "@mini-commerce/bff", "exec", "prisma", "db", "seed"]
    )
    pass_("Seed complete.")
    print()
    return 0
