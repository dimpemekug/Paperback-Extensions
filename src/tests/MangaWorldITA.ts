// Live tests against www.mangaworld.me, run by `npm run test:live` (Node 24).

import { type TestLogger } from "@paperback/types";

import { MangaWorldITA } from "../MangaWorldITA/main.js";
import sourceInfo from "../MangaWorldITA/pbconfig.js";
import { TestSuite, registerDefaultTests } from "./suite.js";

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export async function runTests(logger: TestLogger) {
  const suite = new TestSuite("MangaWorldITA tests", logger);
  registerDefaultTests(suite, MangaWorldITA, sourceInfo);

  suite.test("Ogni sezione di Esplora ha elementi", async () => {
    for (const section of await MangaWorldITA.getDiscoverSections()) {
      const result = await MangaWorldITA.getDiscoverSectionItems(section, undefined);
      check(result.items.length > 0, `la sezione ${section.id} è vuota`);
    }
  });

  suite.test("Gli ultimi capitoli hanno una seconda pagina diversa dalla prima", async () => {
    const sections = await MangaWorldITA.getDiscoverSections();
    const latest = sections.find((s) => s.id === "latest")!;
    const first = await MangaWorldITA.getDiscoverSectionItems(latest, undefined);
    check(first.metadata !== undefined, "manca la pagina successiva");
    const second = await MangaWorldITA.getDiscoverSectionItems(latest, first.metadata as { page: number });
    check(second.items.length > 0, "la seconda pagina è vuota");
  });

  suite.test("La ricerca per titolo trova la serie", async () => {
    const results = await MangaWorldITA.getSearchResults({ title: "one piece" }, undefined, undefined);
    check(
      results.items.some((item) => item.title === "One Piece"),
      "One Piece non è tra i risultati",
    );
  });

  suite.test("Un genere della home filtra la ricerca", async () => {
    const results = await MangaWorldITA.getSearchResults(
      { title: "", metadata: { genres: { shounen: "included" } } },
      undefined,
      { id: "most_read", label: "Più letti" },
    );
    check(results.items.length === 20, `attesi 20 risultati, trovati ${results.items.length}`);
    check(results.metadata !== undefined, "manca la pagina successiva");
  });

  await suite.run();
}
