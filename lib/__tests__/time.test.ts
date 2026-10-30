import { describe, expect, it } from "vitest";
import { DAY, dayMs, dt, esc, fmt, hm, iso, ms, nowWall, pad, todayMs, wall, ymd } from "../time";

describe("lib/time wall-clock helpers", () => {
  it("parses campus wall-clock ISO strings into UTC epoch ms", () => {
    expect(ms("2026-10-29T09:15:00")).toBe(Date.UTC(2026, 9, 29, 9, 15, 0));
    expect(ms("2026-10-29T09:15:00")).toBe(Date.UTC(2026, 9, 29) + 9 * 36e5 + 15 * 6e4);
  });

  it("formats epoch ms back to naive ISO / wall-clock strings", () => {
    expect(iso(0)).toBe("1970-01-01T00:00:00");
    expect(hm(0)).toBe("00:00");
    expect(ymd(0)).toBe("1970-01-01");
  });

  it("converts between day boundaries and wall-clock strings", () => {
    expect(dayMs("2026-10-29")).toBe(Date.UTC(2026, 9, 29));
    expect(dt(null)).toBeNull();
    expect(dt("2026-10-29T09:00")).toBe("2026-10-29T09:00:00");
  });

  it("formats display strings without timezone drift", () => {
    expect(fmt("2026-10-29T09:15:00")).toBe("10-29 09:15");
  });

  it("derives today (midnight) and nowWall", () => {
    const now = new Date();
    const expected = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    expect(todayMs()).toBe(expected);
    expect(nowWall()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00$/);
  });

  it("exposes the campus day constant", () => {
    expect(DAY).toBe(864e5);
    expect(pad(5)).toBe("05");
  });

  it("html-escapes user-supplied strings", () => {
    expect(esc("<b>&\"'</b>")).toBe("&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;");
  });
});
