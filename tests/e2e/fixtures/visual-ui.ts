import { expect, type Locator, type Page } from "@playwright/test";

type VisualActionableOptions = {
  minHeight?: number;
  minWidth?: number;
};

type CssUtilityExpectation = {
  className: string;
  property: string;
  value: string;
};

const DEFAULT_MIN_TARGET = 24;
const VIEWPORT_EDGE_TOLERANCE = 2;

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const size = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(
    size.scrollWidth,
    "page must not horizontally overflow the viewport",
  ).toBeLessThanOrEqual(size.clientWidth + 1);
}

export async function expectVisualActionable(
  locator: Locator,
  options: VisualActionableOptions = {},
): Promise<void> {
  const minWidth = options.minWidth ?? DEFAULT_MIN_TARGET;
  const minHeight = options.minHeight ?? DEFAULT_MIN_TARGET;

  await expect(locator).toBeVisible();
  await expect(locator).toBeEnabled();
  await expectInViewport(locator);
  await expectCenterHits(locator);

  const box = await requiredBoundingBox(locator);
  expect(
    box.width,
    `target must be at least ${minWidth}px wide`,
  ).toBeGreaterThanOrEqual(minWidth);
  expect(
    box.height,
    `target must be at least ${minHeight}px tall`,
  ).toBeGreaterThanOrEqual(minHeight);
}

export async function clickVisualCenter(locator: Locator): Promise<void> {
  await expectVisualActionable(locator);

  const box = await requiredBoundingBox(locator);
  await locator
    .page()
    .mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

export async function expectCenterHits(locator: Locator): Promise<void> {
  const box = await requiredBoundingBox(locator);
  const center = {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };

  const result = await locator.evaluate((element, point) => {
    const top = document.elementFromPoint(point.x, point.y);

    return {
      hit:
        top === element ||
        (top ? element.contains(top) || top.contains(element) : false),
      topTag: top?.tagName.toLowerCase() ?? null,
      topText:
        top?.textContent?.replace(/\s+/g, " ").trim().slice(0, 120) ?? null,
    };
  }, center);

  expect(
    result.hit,
    `center point must hit target or its content, got ${result.topTag}: ${result.topText}`,
  ).toBe(true);
}

export async function expectInViewport(locator: Locator): Promise<void> {
  const box = await requiredBoundingBox(locator);
  const viewport = locator.page().viewportSize();

  if (!viewport) {
    throw new Error("Expected Playwright viewport to be configured.");
  }

  expect(
    box.x,
    "target left edge must be inside viewport",
  ).toBeGreaterThanOrEqual(0);
  expect(
    box.y,
    "target top edge must be inside viewport",
  ).toBeGreaterThanOrEqual(0);
  expect(
    box.x + box.width,
    "target right edge must be inside viewport",
  ).toBeLessThanOrEqual(viewport.width + VIEWPORT_EDGE_TOLERANCE);
  expect(
    box.y + box.height,
    "target bottom edge must be inside viewport",
  ).toBeLessThanOrEqual(viewport.height + VIEWPORT_EDGE_TOLERANCE);
}

export async function expectCssUtilityContract(page: Page): Promise<void> {
  const expectations: CssUtilityExpectation[] = [
    { className: "fixed", property: "position", value: "fixed" },
    { className: "sticky", property: "position", value: "sticky" },
    { className: "right-0", property: "right", value: "0px" },
    { className: "bottom-0", property: "bottom", value: "0px" },
    { className: "z-50", property: "zIndex", value: "50" },
    { className: "w-10", property: "width", value: "40px" },
    { className: "h-10", property: "height", value: "40px" },
    { className: "w-16", property: "width", value: "64px" },
    { className: "h-16", property: "height", value: "64px" },
    {
      className: "min-h-screen",
      property: "minHeight",
      value: `${page.viewportSize()?.height}px`,
    },
    { className: "aspect-video", property: "aspectRatio", value: "16 / 9" },
    { className: "aspect-[4/3]", property: "aspectRatio", value: "4 / 3" },
    { className: "flex-1", property: "flexGrow", value: "1" },
    { className: "flex-shrink-0", property: "flexShrink", value: "0" },
    { className: "overflow-y-auto", property: "overflowY", value: "auto" },
  ];

  const results = await page.evaluate((items) => {
    return items.map(({ className, property, value }) => {
      const element = document.createElement("div");
      element.className = className;
      element.style.visibility = "hidden";
      element.style.pointerEvents = "none";
      document.body.append(element);

      const actual =
        getComputedStyle(element)[property as keyof CSSStyleDeclaration];
      element.remove();

      return {
        actual: String(actual),
        className,
        ok: String(actual) === value,
        property,
        value,
      };
    });
  }, expectations);

  for (const result of results) {
    expect(
      result.ok,
      `.${result.className} should set ${result.property}=${result.value}, got ${result.actual}`,
    ).toBe(true);
  }
}

async function requiredBoundingBox(locator: Locator) {
  const box = await locator.boundingBox();

  if (!box) {
    throw new Error("Expected locator to have a bounding box.");
  }

  return box;
}

/**
 * Asserts the iframe at `iframeLocator` is painting non-uniform pixels — i.e.
 * the embedded visualizer actually rendered something, not a blank canvas or
 * an error placeholder. We do this by taking a Playwright screenshot clipped
 * to the iframe's bounding rect (works on WebGL without preserveDrawingBuffer)
 * and counting distinct bytes in the resulting PNG.
 *
 * `minDistinctBytes` is the lower bound on unique byte values in the PNG (raw
 * compressed bytes). A blank canvas tends to produce well under 20 distinct
 * bytes; a real rendered scene easily exceeds 200.
 */
export async function expectIframeCanvasPainted(
  page: Page,
  iframeLocator: Locator,
  options: { minDistinctBytes?: number } = {},
): Promise<void> {
  const minDistinctBytes = options.minDistinctBytes ?? 80;

  await expect(iframeLocator).toBeVisible();
  const box = await requiredBoundingBox(iframeLocator);
  expect(box.width, "iframe must have non-zero width").toBeGreaterThan(20);
  expect(box.height, "iframe must have non-zero height").toBeGreaterThan(20);

  const screenshot = await page.screenshot({
    clip: {
      x: box.x,
      y: box.y,
      width: Math.min(box.width, page.viewportSize()?.width ?? box.width),
      height: Math.min(box.height, page.viewportSize()?.height ?? box.height),
    },
  });

  const distinct = new Set<number>();
  for (let i = 0; i < screenshot.length; i += 1) {
    distinct.add(screenshot[i]!);
    if (distinct.size > minDistinctBytes) break;
  }

  expect(
    distinct.size,
    `embedded iframe must paint non-uniform pixels (got ${distinct.size} distinct bytes)`,
  ).toBeGreaterThan(minDistinctBytes);
}
