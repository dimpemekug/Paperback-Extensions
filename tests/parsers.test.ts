import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  chapterIdFromUrl,
  chapterUrl,
  mangaIdFromUrl,
  parseArchive,
  parseChapterName,
  parseChapterPages,
  parseChapters,
  parseFilters,
  parseItalianDate,
  parseLatest,
  parseMangaDetails,
  parseTrending,
  ratingForGenres,
} from "../src/MangaWorldITA/parsers";
import { BASE, fixture } from "./support/fixtures";

describe("Indirizzi", () => {
  test("L'id di una serie è il numero dopo /manga/, lo slug non conta", () => {
    assert.equal(mangaIdFromUrl(`${BASE}/manga/1708/one-piece`), "1708");
    assert.equal(mangaIdFromUrl(`${BASE}/archive`), undefined);
  });

  test("L'id di un capitolo è quello dopo /read/", () => {
    assert.equal(chapterIdFromUrl(`${BASE}/manga/1708/one-piece/read/6b032279179d77b59c06a674`), "6b032279179d77b59c06a674");
  });

  test("L'indirizzo di lettura si costruisce senza conoscere lo slug", () => {
    assert.equal(chapterUrl(BASE, "1708", "abc123"), `${BASE}/manga/1708/_/read/abc123`);
  });
});

describe("Archivio", () => {
  test("Una pagina piena dà 20 serie con copertina e la pagina successiva", () => {
    const page = parseArchive(fixture("archive-page2.html"));
    assert.equal(page.items.length, 20);
    assert.equal(page.hasNextPage, true);
    const first = page.items[0]!;
    assert.match(first.mangaId, /^\d+$/);
    assert.ok(first.title.length > 0);
    assert.match(first.imageUrl, /^https:\/\/cdn\.mangaworld\.me\//);
    assert.doesNotMatch(first.imageUrl, /\?\d+$/, "il parametro anti-cache va tolto");
  });

  test("Una ricerca con pochi risultati non ha pagina successiva", () => {
    const page = parseArchive(fixture("archive-search.html"));
    assert.equal(page.items.length, 7);
    assert.equal(page.hasNextPage, false);
    assert.ok(page.items.some((item) => item.title === "Naruto"));
  });

  test("I filtri dell'archivio danno generi, tipologie, stati e ordinamenti con le etichette italiane", () => {
    const filters = parseFilters(fixture("archive-search.html"));
    assert.equal(filters.genres.length, 36);
    assert.deepEqual(filters.genres[0], { id: "adulti", title: "Adulti" });
    assert.ok(filters.types.some((t) => t.id === "manhwa"));
    assert.deepEqual(filters.status[0], { id: "ongoing", title: "In corso" });
    assert.deepEqual(filters.sort.map((s) => s.id).slice(0, 2), ["relevance", "most_read"]);
  });
});

describe("Home", () => {
  test("Le tendenze mostrano ogni serie una volta sola", () => {
    const items = parseTrending(fixture("home.html"));
    assert.ok(items.length > 0);
    assert.equal(new Set(items.map((i) => i.mangaId)).size, items.length);
    assert.equal(items[0]!.title, "One Piece");
    assert.match(items[0]!.supertitle ?? "", /^Capitolo/);
  });

  test("Gli ultimi capitoli portano serie, capitolo e pagina successiva", () => {
    const latest = parseLatest(fixture("home.html"));
    assert.equal(latest.items.length, 16);
    assert.equal(latest.hasNextPage, true);
    const first = latest.items[0]!;
    assert.match(first.mangaId, /^\d+$/);
    assert.match(first.chapterId, /^[0-9a-f]{24}$/);
  });

  test("La seconda pagina degli ultimi capitoli ha serie diverse dalla prima", () => {
    const first = parseLatest(fixture("home.html")).items.map((i) => i.mangaId);
    const second = parseLatest(fixture("home-page2.html")).items.map((i) => i.mangaId);
    assert.ok(second.length > 0);
    assert.notDeepEqual(first, second);
  });
});

describe("Serie", () => {
  const details = parseMangaDetails(fixture("manga.html"), "1708", BASE);

  test("I dettagli hanno titolo, copertina, trama, autori, stato e generi", () => {
    const info = details.mangaInfo;
    assert.equal(info.primaryTitle, "One Piece");
    assert.ok(info.secondaryTitles.includes("ワンピース"));
    assert.match(info.thumbnailUrl, /\/mangas\/5fa0c9e2c9f2201ee55d3bd4\.jpg$/);
    assert.match(info.synopsis, /^Monkey D\. Rufy/);
    assert.equal(info.author, "ODA Eiichiro");
    assert.equal(info.status, "Ongoing");
    assert.ok(info.tagGroups?.[0]?.tags.some((t) => t.id === "shounen"));
    assert.equal(info.contentRating, "SAFE");
    assert.equal(info.shareUrl, `${BASE}/manga/1708`);
  });

  test("I capitoli escono dal più nuovo al più vecchio, con volume e data", () => {
    const chapters = parseChapters(fixture("manga.html"), details);
    assert.equal(chapters.length, 1201);
    const newest = chapters[0]!;
    assert.equal(newest.chapterId, "6b032279179d77b59c06a674");
    assert.equal(newest.chapNum, 1199);
    assert.equal(newest.volume, 116);
    assert.equal(newest.publishDate?.toISOString(), "2026-11-22T00:00:00.000Z");
    assert.ok(newest.sortingIndex! > chapters[1]!.sortingIndex!);
    assert.equal(chapters.at(-1)!.chapNum, 0);
  });

  test("Le pagine di un capitolo sono le immagini del lettore, in ordine", () => {
    const pages = parseChapterPages(fixture("chapter.html"));
    assert.equal(pages.length, 13);
    assert.match(pages[0]!, /\/capitolo-1199-6b032279179d77b59c06a674\/1\.jpg$/);
    assert.match(pages[12]!, /\/13\.png$/);
  });
});

describe("Testi", () => {
  test("Un nome di capitolo con decimale e titolo si divide in numero e titolo", () => {
    assert.deepEqual(parseChapterName("Capitolo 12.5 - Il ritorno"), { chapNum: 12.5, title: "Il ritorno" });
    assert.deepEqual(parseChapterName("Capitolo 7"), { chapNum: 7, title: undefined });
    assert.deepEqual(parseChapterName("Oneshot"), { chapNum: 0, title: "Oneshot" });
  });

  test("Le date italiane diventano date, i testi sconosciuti no", () => {
    assert.equal(parseItalianDate("05 Gennaio 2025")?.toISOString(), "2025-01-05T00:00:00.000Z");
    assert.equal(parseItalianDate("ieri"), undefined);
  });

  test("I generi per adulti o maturi alzano la classificazione della serie", () => {
    assert.equal(ratingForGenres(["azione"]), "SAFE");
    assert.equal(ratingForGenres(["azione", "ecchi"]), "MATURE");
    assert.equal(ratingForGenres(["ecchi", "hentai"]), "ADULT");
  });
});
