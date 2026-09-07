// apps/visualizer-3d/public/layout/traffic-render.js
//
// Owns traffic-cup placement, fall/land/terminal state, and disposal —
// the traffic equivalent of layout/render.js's hero-placement + animate
// concern, kept in its own file so layout/render.js is never touched.
import { buildTrafficCupGroup, trafficVisualFor } from "../objects/traffic-cup.js";
import { STATUS_COLORS } from "../materials.js";

const FALL_SPEED    = 0.9;  // world units / second
const FLOOR_Y        = 0.02;
const SETTLE_MS      = 900; // time visible after terminal treatment before despawn
const LANDED_TIMEOUT_MS = 5000; // landed but no terminal event ever arrived (lost
                                // event / dropped connection) — despawn rather
                                // than park on the floor forever
const MAX_CONCURRENT = 60;  // hard cap safety net — see RUN-006/SPEC-009 scope note

export function createTrafficRenderer({ trafficGroup }) {
  const cupsByIteration = new Map(); // iterationId → THREE.Group
  let lastFrameAt = null;

  function disposeCup(group) {
    cupsByIteration.delete(group.userData.iterationId);
    trafficGroup.remove(group);
    group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (obj.material.map) obj.material.map.dispose();
        obj.material.dispose();
      }
    });
  }

  function spawnCup(useCaseId, iterationId) {
    if (trafficGroup.children.length >= MAX_CONCURRENT) {
      disposeCup(trafficGroup.children[0]);
    }
    const visual = trafficVisualFor(useCaseId);
    const group = buildTrafficCupGroup(useCaseId);
    group.position.set(visual.laneX, visual.spawnY, 0.6);
    group.userData = { iterationId, state: "falling", outcome: null, landedAt: null };
    trafficGroup.add(group);
    cupsByIteration.set(iterationId, group);
    return group;
  }

  // Succeeded reads as a normal landing (no extra treatment); failed tips
  // over and tints red so it is never mistaken for a successful landing.
  function applyTerminalTreatment(group, outcome) {
    if (outcome !== "failed") return;
    const mesh = group.children[0];
    mesh.rotation.z = Math.PI / 2.2;
    mesh.material.color?.set?.(STATUS_COLORS.error);
  }

  function handleEvent(evt) {
    if (evt.outcome === "started") {
      if (cupsByIteration.has(evt.iterationId)) return; // idempotent against SSE replay/reconnect duplicates
      spawnCup(evt.useCaseId, evt.iterationId);
      return;
    }
    const existing = cupsByIteration.get(evt.iterationId);
    if (existing) {
      existing.userData.outcome = evt.outcome;
      return;
    }
    // Late-connecting client: no in-flight cup for this iterationId — spawn
    // directly at its terminal treatment rather than dropping the event.
    const group = spawnCup(evt.useCaseId, evt.iterationId);
    group.position.y = FLOOR_Y;
    group.userData.state = "terminal";
    group.userData.outcome = evt.outcome;
    group.userData.landedAt = performance.now();
    applyTerminalTreatment(group, evt.outcome);
  }

  function tick(now) {
    const dt = lastFrameAt === null ? 1 / 60 : Math.min((now - lastFrameAt) / 1000, 0.1);
    lastFrameAt = now;
    for (let i = trafficGroup.children.length - 1; i >= 0; i--) {
      const cupGroup = trafficGroup.children[i];
      const ud = cupGroup.userData;
      if (ud.state === "falling") {
        cupGroup.position.y -= FALL_SPEED * dt;
        if (cupGroup.position.y <= FLOOR_Y) {
          cupGroup.position.y = FLOOR_Y;
          ud.landedAt = now;
          if (ud.outcome) {
            ud.state = "terminal";
            applyTerminalTreatment(cupGroup, ud.outcome);
          } else {
            ud.state = "landed";
          }
        }
      } else if (ud.state === "landed") {
        if (ud.outcome) {
          ud.state = "terminal";
          ud.landedAt = now;
          applyTerminalTreatment(cupGroup, ud.outcome);
        } else if (now - ud.landedAt > LANDED_TIMEOUT_MS) {
          disposeCup(cupGroup);
        }
      } else if (ud.state === "terminal" && now - ud.landedAt > SETTLE_MS) {
        disposeCup(cupGroup);
      }
    }
  }

  return { handleEvent, tick };
}
