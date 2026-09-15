import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Frame, type Page } from "@playwright/test";

const publicDir = path.resolve(__dirname, "../../../apps/visualizer-3d/public");
const product = {
  productId: "prod_viz_espresso",
  sku: "VIZ-ESP",
  name: "Visualizer Espresso",
  description: "Coffee for the visualizer interaction checks.",
  category: "drink",
  price: { amountMinor: 350, currency: "USD" },
  inventory: 50,
};
const secondProduct = {
  ...product,
  productId: "prod_viz_tall",
  name: "Tall Coffee",
};
const timestamp = "2026-09-14T12:00:00.000Z";

type Snapshot = {
  camera: { position: number[]; quaternion: number[]; fov: number };
  hero: null | {
    uuid: string;
    productId: string;
    phase: string;
    rotation: number;
    z: number;
    distance: number;
    parts: number;
    height: number;
    bounds: { left: number; right: number; bottom: number; top: number };
  };
  rain: Array<{
    id: string;
    state: string;
    x: number;
    y: number;
    z: number;
    height: number;
  }>;
};

declare global {
  interface Window {
    __visualizerTest: {
      snapshot: () => Snapshot;
      simulateRain: (count: number) => {
        baseline: number;
        count: number;
        deduped: number;
        disposed: boolean;
        rain: Snapshot["rain"];
      };
      angles: () => Array<NonNullable<Snapshot["hero"]>["bounds"]>;
    };
  }
}

// The app and Three.js modules are real. Only API responses are fixtures;
// scene inspection is appended to the served module, never production code.
async function installScene(
  page: Page,
  options: {
    failCheckout?: boolean;
    delayScene?: boolean;
    delayAdd?: boolean;
    checkoutProduct?: typeof product;
  } = {},
) {
  let cartProduct: typeof product | null = null;
  const orders = [makeOrder("ord_before_load", product)];
  let releaseScene = () => {};
  const sceneGate = new Promise<void>((resolve) => {
    releaseScene = resolve;
  });
  if (!options.delayScene) releaseScene();
  let releaseAdd = () => {};
  const addGate = new Promise<void>((resolve) => {
    releaseAdd = resolve;
  });
  if (!options.delayAdd) releaseAdd();

  const scene = () => ({
    products: [
      { ...product, status: "ok" },
      { ...secondProduct, status: "ok", assetConfig: { bodyH: 0.42 } },
    ],
    recentOrders: orders.map((order) => ({
      ...order,
      vizStatus: "warn",
      lineCount: 1,
    })),
    orderAggregates: {
      totalCount: orders.length,
      olderCount: 20,
      statusCounts: { pending: orders.length },
    },
    cart: null,
    latestActivityAt: Date.parse(timestamp),
  });
  await page.addInitScript(() => localStorage.removeItem("expresso_demo_mode"));
  await page.route("**/viz/**", async (route) => {
    const name = new URL(route.request().url()).pathname.replace(
      /^\/viz\//,
      "",
    );
    if (name === "config.js")
      return route.fulfill({ contentType: "text/javascript", body: "" });
    if (name === "scene.js") await sceneGate;
    let body = await readFile(path.join(publicDir, name), "utf8");
    if (name === "scene.js") body += inspectionScript;
    return route.fulfill({
      body,
      contentType: name.endsWith(".html")
        ? "text/html"
        : name.endsWith(".css")
          ? "text/css"
          : "text/javascript",
    });
  });
  await page.route("**/api/bff/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const endpoint = url.pathname.replace(/^\/api\/bff/, "");
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, json: body });
    if (endpoint === "/health")
      return json({ status: "ok", checks: { db: "ok" } });
    if (endpoint === "/catalog/products")
      return json({ items: [product, secondProduct] });
    if (endpoint === "/visualization-data") return json({ scene: scene() });
    if (endpoint === "/visualization-updates") {
      return route.fulfill({
        contentType: "text/event-stream",
        body: `data: ${JSON.stringify({ scene: scene() })}\n\n`,
      });
    }
    if (endpoint === "/cart/items" && request.method() === "POST") {
      await addGate;
      cartProduct =
        request.postDataJSON().productId === secondProduct.productId
          ? secondProduct
          : product;
    }
    if (endpoint === "/cart" || endpoint === "/cart/items") {
      return json({
        cartId: "cart_viz",
        updatedAt: timestamp,
        itemCount: cartProduct ? 1 : 0,
        total: cartProduct?.price ?? { amountMinor: 0, currency: "USD" },
        items: cartProduct
          ? [{ ...makeOrder("cart", cartProduct).lines[0], itemId: "line_viz" }]
          : [],
      });
    }
    if (endpoint === "/checkout") {
      if (options.failCheckout)
        return json({ message: "Checkout conflict" }, 409);
      const order = makeOrder(
        "ord_viz_placed",
        options.checkoutProduct ?? cartProduct!,
      );
      orders.unshift(order);
      cartProduct = null;
      return json({ ...order, cartId: "cart_viz" });
    }
    if (endpoint === "/orders") return json({ items: orders });
    const order = orders.find((item) => endpoint === `/orders/${item.orderId}`);
    if (order) return json(order);
    return json({ message: "Unknown test endpoint" }, 404);
  });
  return { releaseScene, releaseAdd };
}

function makeOrder(orderId: string, selected: typeof product) {
  return {
    orderId,
    customerName: null,
    status: "pending",
    total: selected.price,
    placedAt: timestamp,
    updatedAt: timestamp,
    lines: [
      {
        productId: selected.productId,
        name: selected.name,
        quantity: 1,
        unitPrice: selected.price,
        lineTotal: selected.price,
      },
    ],
  };
}

async function sceneFrame(page: Page) {
  const iframe = await page.getByTestId("visualizer-iframe").elementHandle();
  const frame = await iframe!.contentFrame();
  await frame!.waitForFunction(() => Boolean(window.__visualizerTest));
  return frame!;
}

const snapshot = (frame: Frame) =>
  frame.evaluate(() => window.__visualizerTest.snapshot());

for (const width of [1440, 1024]) {
  test(`selected cup rotates, checkout moves it closer, and camera stays fixed at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await installScene(page);
    await page.goto("/");
    let frame = await sceneFrame(page);
    await expect(frame.locator("#status")).toContainText("live");
    const initial = await snapshot(frame);
    expect(initial.hero).toBeNull();
    expect(initial.rain).toEqual([]);

    await page
      .getByRole("button", { name: `Add ${product.name} to cart` })
      .click();
    await expect
      .poll(async () => (await snapshot(frame)).hero?.phase)
      .toBe("selected");
    const selected = (await snapshot(frame)).hero!;
    expect(selected.productId).toBe(product.productId);
    expect(selected.parts).toBe(4);
    await expect
      .poll(async () => (await snapshot(frame)).hero!.rotation)
      .toBeGreaterThan(selected.rotation + 0.1);

    const canvas = page
      .frameLocator('[data-testid="visualizer-iframe"]')
      .locator("canvas");
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + 60,
      box.y + box.height / 2 - 50,
      { steps: 8 },
    );
    await page.mouse.up();
    await page.mouse.wheel(0, 400);
    expect((await snapshot(frame)).camera).toEqual(initial.camera);

    await page.screenshot({ path: test.info().outputPath("selected.png") });
    await page
      .getByRole("button", { name: "Place Order", exact: true })
      .click();
    await expect(page.getByTestId("home-orders")).toBeVisible();
    await expect
      .poll(async () => (await snapshot(frame)).hero?.z)
      .toBeGreaterThan(0.9);
    const ordered = (await snapshot(frame)).hero!;
    expect(ordered.phase).toBe("ordered");
    expect(ordered.uuid).toBe(selected.uuid);
    expect(ordered.distance).toBeLessThan(selected.distance * 0.75);
    expect(ordered.parts).toBe(4);
    expect((await snapshot(frame)).camera).toEqual(initial.camera);
    for (const bounds of await frame.evaluate(() =>
      window.__visualizerTest.angles(),
    )) {
      expect(bounds.left).toBeGreaterThan(-1);
      expect(bounds.right).toBeLessThan(1);
      expect(bounds.bottom).toBeGreaterThan(-1);
      expect(bounds.top).toBeLessThan(1);
    }
    await page.screenshot({ path: test.info().outputPath("ordered.png") });

    // An iframe reload replays local selection; global history still cannot
    // replace it with a ticket or seed old orders into the rain.
    await page.getByRole("button", { name: "Reload visualizer" }).click();
    frame = await sceneFrame(page);
    await expect
      .poll(async () => (await snapshot(frame)).hero?.phase)
      .toBe("ordered");
    expect((await snapshot(frame)).hero?.productId).toBe(product.productId);
    expect((await snapshot(frame)).rain).toEqual([]);
  });
}

test("selection made before the iframe loads is replayed and keeps catalog geometry overrides", async ({
  page,
}) => {
  const { releaseScene } = await installScene(page, { delayScene: true });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: `View details for ${secondProduct.name}` })
    .click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  releaseScene();
  const frame = await sceneFrame(page);
  await expect
    .poll(async () => (await snapshot(frame)).hero?.productId)
    .toBe(secondProduct.productId);
  await expect
    .poll(async () => (await snapshot(frame)).hero!.height)
    .toBeGreaterThan(0.7);
  expect((await snapshot(frame)).hero?.phase).toBe("selected");
});

test("failed checkout keeps the selected cup at medium distance", async ({
  page,
}) => {
  await installScene(page, { failCheckout: true });
  await page.goto("/");
  const frame = await sceneFrame(page);
  await page
    .getByRole("button", { name: `Add ${product.name} to cart` })
    .click();
  await expect
    .poll(async () => (await snapshot(frame)).hero?.phase)
    .toBe("selected");
  const before = (await snapshot(frame)).hero!;
  await page.getByRole("button", { name: "Place Order", exact: true }).click();
  await expect(page.getByTestId("cart-checkout-panel")).toContainText(
    "Checkout conflict",
  );
  const after = (await snapshot(frame)).hero!;
  expect(after.phase).toBe("selected");
  expect(after.z).toBe(before.z);
  expect(after.uuid).toBe(before.uuid);
});

test("rain persists in distant stacks, deduplicates orders, and recycles at its cap", async ({
  page,
}) => {
  await installScene(page);
  await page.goto("/");
  const frame = await sceneFrame(page);
  const result = await frame.evaluate(() =>
    window.__visualizerTest.simulateRain(55),
  );
  expect(result.baseline).toBe(0);
  expect(result.count).toBe(40);
  expect(result.deduped).toBe(40);
  expect(result.disposed).toBe(true);
  const columns = new Map<number, Snapshot["rain"]>();
  for (const cup of result.rain) {
    expect(cup.state).toBe("landed");
    expect(cup.z).toBeLessThan(-5);
    columns.set(cup.x, [...(columns.get(cup.x) ?? []), cup]);
  }
  expect(columns.size).toBe(5);
  for (const cups of columns.values()) {
    cups.sort((a, b) => a.y - b.y);
    expect(cups[0]!.y).toBeCloseTo(0.02);
    for (let i = 1; i < cups.length; i++) {
      expect(cups[i]!.y).toBeCloseTo(cups[i - 1]!.y + cups[i - 1]!.height);
    }
  }
  expect((await snapshot(frame)).hero).toBeNull();
  await page.screenshot({ path: test.info().outputPath("distant-stacks.png") });
});

test("a delayed add response cannot replace a newer catalog selection", async ({
  page,
}) => {
  const { releaseAdd } = await installScene(page, { delayAdd: true });
  await page.goto("/");
  const frame = await sceneFrame(page);
  await page
    .getByRole("button", { name: `Add ${product.name} to cart` })
    .click();
  await expect
    .poll(async () => (await snapshot(frame)).hero?.productId)
    .toBe(product.productId);
  await page
    .getByRole("button", { name: `View details for ${secondProduct.name}` })
    .click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  releaseAdd();
  await expect(page.getByTestId("cart-checkout-panel")).toContainText(
    product.name,
  );
  expect((await snapshot(frame)).hero?.productId).toBe(secondProduct.productId);
});

test("close-up uses the purchased product even when the cached cart differs", async ({
  page,
}) => {
  await installScene(page, { checkoutProduct: secondProduct });
  await page.goto("/");
  const frame = await sceneFrame(page);
  await page
    .getByRole("button", { name: `Add ${product.name} to cart` })
    .click();
  await expect(page.getByTestId("cart-checkout-panel")).toContainText(
    product.name,
  );
  await page.getByRole("button", { name: "Place Order", exact: true }).click();
  await expect
    .poll(async () => (await snapshot(frame)).hero?.phase)
    .toBe("ordered");
  expect((await snapshot(frame)).hero?.productId).toBe(secondProduct.productId);
  await expect
    .poll(async () => (await snapshot(frame)).hero!.height)
    .toBeGreaterThan(0.7);
});

const inspectionScript = `
function inspectGroup(group) {
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const corners = [];
  group.traverse(object => {
    const vertices = object.geometry?.getAttribute('position');
    if (!vertices) return;
    for (let index = 0; index < vertices.count; index++) {
      const vertex = new THREE.Vector3().fromBufferAttribute(vertices, index);
      corners.push(object.localToWorld(vertex).project(camera));
    }
  });
  return {
    uuid: group.uuid, productId: group.userData.productId, phase: group.userData.phase,
    rotation: group.rotation.y, z: group.position.z,
    distance: group.position.distanceTo(camera.position), parts: group.children.length,
    height: box.max.y - box.min.y,
    bounds: {
      left: Math.min(...corners.map(p => p.x)), right: Math.max(...corners.map(p => p.x)),
      bottom: Math.min(...corners.map(p => p.y)), top: Math.max(...corners.map(p => p.y)),
    },
  };
}
function inspectRain(group) {
  return group.children.map(cup => ({
    id: cup.userData.orderId, state: cup.userData.state,
    x: cup.position.x, y: cup.position.y, z: cup.position.z,
    height: new THREE.Box3().setFromObject(cup).getSize(new THREE.Vector3()).y,
  }));
}
window.__visualizerTest = {
  snapshot() {
    return {
      camera: { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), fov: camera.fov },
      hero: dataGroup.children[0] ? inspectGroup(dataGroup.children[0]) : null,
      rain: inspectRain(rainGroup),
    };
  },
  angles() {
    const cup = dataGroup.children[0];
    const original = cup.rotation.y;
    const bounds = Array.from({ length: 16 }, (_, index) => index * Math.PI / 8).map(angle => {
      cup.rotation.y = angle;
      return inspectGroup(cup).bounds;
    });
    cup.rotation.y = original;
    return bounds;
  },
  simulateRain(count) {
    const group = new THREE.Group();
    scene.add(group);
    const rain = createRainRenderer({ rainGroup: group });
    rain.handleScene({ recentOrders: [{ orderId: 'old' }] });
    rain.tick(0);
    const baseline = group.children.length;
    const orders = Array.from({ length: count }, (_, i) => ({ orderId: 'stack-' + i }));
    rain.handleScene({ recentOrders: orders });
    rain.tick(200);
    let disposed = false;
    group.children[0].children[0].geometry.addEventListener('dispose', () => { disposed = true; });
    const finish = count * 200 + 8000;
    for (let now = 300; now <= finish; now += 100) rain.tick(now);
    const landedCount = group.children.length;
    rain.handleScene({ recentOrders: orders.map(order => ({ ...order, status: 'prepared' })) });
    for (let now = finish + 100; now <= finish + 5000; now += 100) rain.tick(now);
    renderer.render(scene, camera);
    return { baseline, count: landedCount, deduped: group.children.length, disposed, rain: inspectRain(group) };
  },
};
`;
