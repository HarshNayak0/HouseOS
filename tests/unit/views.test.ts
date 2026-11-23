import { describe, expect, it } from "vitest";
import { roomCenter, roomView, views } from "@/scene/camera/views";
import { chooseView } from "@/lib/view-pref";

describe("camera views", () => {
  it("pulls the camera back further in portrait", () => {
    const land = views(1200, 800).ext.p.length();
    const port = views(375, 740).ext.p.length();
    expect(port).toBeGreaterThan(land * 1.5);
  });

  it("shifts the target right on desktop so the room sits beside the panel", () => {
    expect(roomView("kitchen", 1200, 800).t.x).toBeGreaterThan(roomCenter("kitchen").x);
  });

  it("shifts the target towards the viewer on phones so the room sits above the sheet", () => {
    expect(roomView("kitchen", 375, 740).t.z).toBeGreaterThan(roomCenter("kitchen").z);
  });
});

describe("chooseView (SPEC §3.4 fallbacks)", () => {
  it("uses 2D without WebGL, whatever the preference", () => {
    expect(chooseView({ pref: "3d", webgl: false, reducedMotion: false }).view).toBe("2d");
  });
  it("uses 2D when reduced motion is preferred and no choice was made", () => {
    expect(chooseView({ pref: null, webgl: true, reducedMotion: true }).view).toBe("2d");
  });
  it("respects an explicit choice", () => {
    expect(chooseView({ pref: "3d", webgl: true, reducedMotion: true }).view).toBe("3d");
    expect(chooseView({ pref: "2d", webgl: true, reducedMotion: false }).view).toBe("2d");
  });
  it("defaults to 3D", () => {
    expect(chooseView({ pref: null, webgl: true, reducedMotion: false }).view).toBe("3d");
  });
});
