import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import path from "node:path";
import { EMPTY_PUBLICATION, type PublicationState } from "./publishedTimetable";
const directory = path.join(process.cwd(), "data", "local-publication");
const filename = path.join(directory, "state.json");
export function readPublication(): PublicationState {
  if (process.env.CAMPUS_AUTH_CONFIG_JSON || !existsSync(filename)) return structuredClone(EMPTY_PUBLICATION);
  return JSON.parse(readFileSync(filename, "utf8")) as PublicationState;
}
export function savePublication(state: PublicationState) {
  if (process.env.CAMPUS_AUTH_CONFIG_JSON) return; // The hosted workflow service owns drafts and publications.
  mkdirSync(directory, { recursive: true });
  writeFileSync(`${filename}.tmp`, JSON.stringify(state, null, 2), "utf8");
  renameSync(`${filename}.tmp`, filename);
}
