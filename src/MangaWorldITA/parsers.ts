// Reads the HTML of www.mangaworld.me (the theme introduced in late 2026).
// Pure functions over a page and the site's base URL: no Application calls,
// so they run unchanged in the offline tests.

import { load, type CheerioAPI } from "cheerio";
import type { Element } from "domhandler";
import type {
  Chapter,
  ChapterUpdatesCarouselItem,
  ContentRating,
  FeaturedCarouselItem,
  MangaInfo,
  SearchResultItem,
  SourceManga,
  TagSection,
} from "@paperback/types";

/** A series as the lists show it: enough for a cover and a title. */
export type ListedManga = {
  mangaId: string;
  title: string;
  imageUrl: string;
  subtitle?: string;
  contentRating: ContentRating;
};

export type ListPage = { items: ListedManga[]; hasNextPage: boolean };

/** The numeric id in `/manga/<id>/<slug>`: the slug is ignored by the site. */
export function mangaIdFromUrl(url: string): string | undefined {
  return /\/manga\/(\d+)/.exec(url)?.[1];
}

/** The id at the end of `/manga/<id>/<slug>/read/<chapterId>`. */
export function chapterIdFromUrl(url: string): string | undefined {
  return /\/read\/([0-9a-f]+)/i.exec(url)?.[1];
}

export function mangaUrl(base: string, mangaId: string): string {
  return `${base}/manga/${mangaId}`;
}

/** Any slug works, the site answers with the right chapter. */
export function chapterUrl(base: string, mangaId: string, chapterId: string): string {
  return `${base}/manga/${mangaId}/_/read/${chapterId}`;
}

/** One query parameter of a link. `URLSearchParams` does not exist in the Paperback runtime. */
export function queryParam(href: string, name: string): string | undefined {
  const query = href.split("#")[0]?.split("?")[1] ?? "";
  for (const pair of query.split("&")) {
    const [key, value = ""] = pair.split("=");
    if (key === name) return decodeURIComponent(value.replace(/\+/g, " "));
  }
  return undefined;
}

const ADULT_GENRES = new Set(["adulti", "hentai", "smut", "yaoi", "yuri", "lolicon", "shotacon"]);
const MATURE_GENRES = new Set(["ecchi", "maturo"]);

export function ratingForGenres(genreIds: string[]): ContentRating {
  if (genreIds.some((g) => ADULT_GENRES.has(g))) return "ADULT" as ContentRating;
  if (genreIds.some((g) => MATURE_GENRES.has(g))) return "MATURE" as ContentRating;
  return "SAFE" as ContentRating;
}

function genreIdsIn($: CheerioAPI, scope: Element): string[] {
  return $(scope)
    .find('a[href*="genre="]')
    .toArray()
    .map((a) => queryParam($(a).attr("href") ?? "", "genre") ?? "")
    .filter((g) => g.length > 0);
}

function text($: CheerioAPI, el: Element | undefined): string {
  return el ? $(el).text().replace(/\s+/g, " ").trim() : "";
}

/** Drops the cache-busting query, so the same cover keeps the same URL. */
function cleanImage(src: string | undefined): string {
  return (src ?? "").replace(/\?\d+$/, "");
}

// MARK: Lists

/** The archive (`/archive?…`): search results and every sorted list. */
export function parseArchive(html: string): ListPage {
  const $ = load(html);
  const items: ListedManga[] = [];
  for (const card of $("article.archive-card").toArray()) {
    const link = $(card).find(".card-title a").first();
    const mangaId = mangaIdFromUrl(link.attr("href") ?? "");
    if (!mangaId) continue;
    const type = text($, $(card).find(".card-tags .tag").get(0));
    const status = text($, $(card).find(".card-tags .status").get(0));
    items.push({
      mangaId,
      title: text($, link.get(0)),
      imageUrl: cleanImage($(card).find(".card-cover img").attr("src")),
      subtitle: [type, status].filter((s) => s.length > 0).join(" · ") || undefined,
      contentRating: ratingForGenres(genreIdsIn($, card)),
    });
  }
  return { items, hasNextPage: items.length > 0 && hasNextPage($) };
}

/** The pager under the lists: the current page is marked, the others are `page=` links. */
function hasNextPage($: CheerioAPI): boolean {
  const current = Number($('[aria-current="page"][aria-label^="Pagina"]').first().text().trim()) || 1;
  const pages = $('a[href*="page="]')
    .toArray()
    .map((a) => Number(/[?&]page=(\d+)/.exec($(a).attr("href") ?? "")?.[1] ?? 0));
  return current < Math.max(0, ...pages);
}

/** "Capitoli di tendenza", the carousel at the top of the home page. */
export function parseTrending(html: string): FeaturedCarouselItem[] {
  const $ = load(html);
  const seen = new Set<string>();
  const items: FeaturedCarouselItem[] = [];
  for (const slide of $("#hero article.slide").toArray()) {
    const link = $(slide).find(".slide-title a").first();
    const mangaId = mangaIdFromUrl(link.attr("href") ?? "");
    if (!mangaId || seen.has(mangaId)) continue;
    seen.add(mangaId);
    items.push({
      type: "featuredCarouselItem",
      mangaId,
      title: text($, link.get(0)),
      imageUrl: cleanImage($(slide).find(".slide-cover img").attr("src")),
      supertitle: text($, $(slide).find(".slide-chapter").get(0)) || undefined,
      summary: text($, $(slide).find(".slide-plot").get(0)) || undefined,
      contentRating: ratingForGenres(genreIdsIn($, slide)),
    });
  }
  return items;
}

/** "Ultimi capitoli aggiunti": the newest chapter of each series, paged with `?page=`. */
export function parseLatest(html: string): { items: ChapterUpdatesCarouselItem[]; hasNextPage: boolean } {
  const $ = load(html);
  const items: ChapterUpdatesCarouselItem[] = [];
  for (const card of $("#latest-grid article.card").toArray()) {
    const title = $(card).find(".card-title a").first();
    const mangaId = mangaIdFromUrl(title.attr("href") ?? "");
    const newest = $(card).find(".ch-list a.ch").first();
    const chapterId = chapterIdFromUrl(newest.attr("href") ?? "");
    if (!mangaId || !chapterId) continue;
    const datetime = newest.find("time").attr("datetime");
    items.push({
      type: "chapterUpdatesCarouselItem",
      mangaId,
      chapterId,
      title: text($, title.get(0)),
      imageUrl: cleanImage($(card).find(".card-cover img").attr("src")),
      subtitle: newest.attr("title")?.trim() || undefined,
      publishDate: datetime ? new Date(datetime) : undefined,
    });
  }
  return { items, hasNextPage: items.length > 0 && hasNextPage($) };
}

// MARK: Series

const STATUS: Record<string, string> = {
  ongoing: "Ongoing",
  completed: "Completed",
  dropped: "Dropped",
  paused: "Hiatus",
  canceled: "Cancelled",
};

export function parseMangaDetails(html: string, mangaId: string, base: string): SourceManga {
  const $ = load(html);
  const facts: Record<string, Element> = {};
  for (const row of $(".manga-facts > div").toArray()) {
    const key = text($, $(row).find("dt").get(0)).replace(/:$/, "");
    const value = $(row).find("dd").get(0);
    if (key && value) facts[key] = value;
  }
  const fact = (key: string) => text($, facts[key]);

  const genres = $(".manga-info .hero-chips a")
    .toArray()
    .map((a) => ({
      id: queryParam($(a).attr("href") ?? "", "genre") ?? "",
      title: text($, a),
    }))
    .filter((t) => t.id.length > 0);
  const tagGroups: TagSection[] = genres.length > 0 ? [{ id: "genres", title: "Generi", tags: genres }] : [];

  const statusCell = facts["Stato"];
  const statusHref = statusCell ? ($(statusCell).find("a").attr("href") ?? "") : "";
  const statusId = queryParam(statusHref, "status") ?? "";

  const alt = text($, $(".manga-alt").get(0)).replace(/^Titoli alternativi:\s*/, "");
  const type = fact("Tipo");
  const rating = Number($(".rating-score strong").first().text().trim());

  const additionalInfo: Record<string, string> = {};
  if (type) additionalInfo["Tipo"] = type;
  if (fact("Anno di uscita")) additionalInfo["Anno"] = fact("Anno di uscita");
  if (fact("Visualizzazioni")) additionalInfo["Visualizzazioni"] = fact("Visualizzazioni");

  const mangaInfo: MangaInfo = {
    primaryTitle: text($, $("h1.manga-title").get(0)),
    secondaryTitles: alt.length > 0 ? alt.split(/,\s*/).filter((t) => t.length > 0) : [],
    thumbnailUrl: cleanImage($(".manga-cover img").attr("src")),
    synopsis: text($, $(".manga-plot").get(0)),
    contentRating: ratingForGenres(genres.map((g) => g.id)),
    status: STATUS[statusId] ?? (fact("Stato") || undefined),
    author: fact("Autore") || undefined,
    artist: fact("Artista") || undefined,
    rating: Number.isFinite(rating) && rating > 0 ? rating / 10 : undefined,
    tagGroups,
    additionalInfo,
    isWebtoon: /manhwa|manhua/i.test(type) || undefined,
    shareUrl: mangaUrl(base, mangaId),
  };
  return { mangaId, mangaInfo };
}

const MONTHS: Record<string, number> = {
  gennaio: 0, febbraio: 1, marzo: 2, aprile: 3, maggio: 4, giugno: 5,
  luglio: 6, agosto: 7, settembre: 8, ottobre: 9, novembre: 10, dicembre: 11,
};

/** "22 Novembre 2026" → that day at midnight UTC. */
export function parseItalianDate(value: string): Date | undefined {
  const match = /(\d{1,2})\s+([a-zà]+)\s+(\d{4})/i.exec(value.trim());
  if (!match) return undefined;
  const month = MONTHS[match[2]!.toLowerCase()];
  if (month === undefined) return undefined;
  return new Date(Date.UTC(Number(match[3]), month, Number(match[1])));
}

/** "Capitolo 12.5 - Titolo" → number 12.5 and title "Titolo". */
export function parseChapterName(name: string): { chapNum: number; title?: string } {
  const match = /(\d+(?:[.,]\d+)?)/.exec(name);
  if (!match) return { chapNum: 0, title: name || undefined };
  const rest = name
    .slice(match.index + match[0].length)
    .replace(/^\s*[-–:.]\s*/, "")
    .trim();
  return { chapNum: Number(match[1]!.replace(",", ".")), title: rest.length > 0 ? rest : undefined };
}

/** Every chapter, newest first, the way the series page lists them. */
export function parseChapters(html: string, sourceManga: SourceManga): Chapter[] {
  const $ = load(html);
  const rows = $("#panel-capitoli li.ch-row").toArray();
  return rows.flatMap((row, index) => {
    const link = $(row).find("a.ch").first();
    const chapterId = $(row).attr("data-chapter") ?? chapterIdFromUrl(link.attr("href") ?? "");
    if (!chapterId) return [];
    const { chapNum, title } = parseChapterName(text($, link.find(".ch-name").get(0)));
    const volumeName = text($, $(row).closest(".volume").find(".volume-name").get(0));
    const volume = Number(/(\d+(?:\.\d+)?)/.exec(volumeName)?.[1]);
    const chapter: Chapter = {
      chapterId,
      sourceManga,
      langCode: "🇮🇹",
      chapNum,
      title,
      volume: Number.isFinite(volume) ? volume : undefined,
      publishDate: parseItalianDate(text($, link.find(".ch-date").get(0))),
      sortingIndex: rows.length - index,
    };
    return [chapter];
  });
}

/** The reader page lists every page as an `<img>`. */
export function parseChapterPages(html: string): string[] {
  const $ = load(html);
  return $(".reader-stage img.reader-page")
    .toArray()
    .map((img) => $(img).attr("src") ?? $(img).attr("data-src") ?? "")
    .filter((src) => src.length > 0);
}

// MARK: Filters

export type FilterOption = { id: string; title: string };
export type Filters = { genres: FilterOption[]; types: FilterOption[]; status: FilterOption[]; sort: FilterOption[] };

/** The options of the archive form: genres, types, status and sort orders. */
export function parseFilters(html: string): Filters {
  const $ = load(html);
  const options = (name: string): FilterOption[] => {
    const seen = new Set<string>();
    return $(`input[name="${name}"]`)
      .toArray()
      .flatMap((input) => {
        const id = $(input).attr("value") ?? "";
        if (!id || seen.has(id)) return [];
        seen.add(id);
        const label = text($, $(input).closest("label").find(".check-label").get(0));
        return [{ id, title: label || id }];
      });
  };
  return { genres: options("genre"), types: options("type"), status: options("status"), sort: options("sort") };
}

export function toSearchResult(item: ListedManga): SearchResultItem {
  return {
    mangaId: item.mangaId,
    title: item.title,
    imageUrl: item.imageUrl,
    subtitle: item.subtitle,
    contentRating: item.contentRating,
  };
}
