import { readFileSync } from "node:fs";

/** Pages saved from www.mangaworld.me (scripts, styles and icons removed). */
export function fixture(name: string): string {
  return readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");
}

export const BASE = "https://www.mangaworld.me";
