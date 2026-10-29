export const pad = (n: number): string => String(n).padStart(2, "0");
export const DAY = 864e5; // 86,400,000 ms

export const esc = (s: unknown): string =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c] || c)
  );

// Campus wall-clock: the timetable's "11:15" means 11:15 on the wall,
// so dates are formatted and parsed without browser local timezone drift.
export const wall = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:00`;

export const ms = (isoStr: string): number => {
  const m = /(\d+)-(\d+)-(\d+)T(\d+):(\d+)/.exec(isoStr);
  if (!m) return Date.now();
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
};

export const iso = (t: number): string => new Date(t).toISOString().slice(0, 19);

export const hm = (t: number): string => {
  const d = new Date(t);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};

export const ymd = (t: number): string => new Date(t).toISOString().slice(0, 10);

export const dayMs = (v: string): number => {
  const [y, m, d] = v.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

export const dt = (v: string | null): string | null => (v ? v + ":00" : null);

export const todayMs = (): number => {
  const n = new Date();
  return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
};

export const nowWall = (): string => wall(new Date());

export const fmt = (isoStr?: string): string => {
  if (!isoStr) return "";
  const t = ms(isoStr);
  return `${ymd(t).slice(5)} ${hm(t)}`;
};
