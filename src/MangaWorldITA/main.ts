import {
  AdvancedSearchForm,
  BasicRateLimiter,
  ButtonRow,
  CloudflareError,
  CookieStorageInterceptor,
  DiscoverSectionType,
  Form,
  InputRow,
  LabelRow,
  PaperbackInterceptor,
  Section,
  SelectRow,
  TriStateSelectRow,
  URL,
  type Chapter,
  type ChapterDetails,
  type Cookie,
  type DiscoverSection,
  type DiscoverSectionItem,
  type ExtensionImpl,
  type FormSectionElement,
  type PagedResults,
  type Request,
  type Response,
  type SearchQuery,
  type SearchResultItem,
  type SortingOption,
  type SourceManga,
} from "@paperback/types";

import pbconfig from "./pbconfig";
import {
  chapterUrl,
  mangaUrl,
  parseArchive,
  parseChapterPages,
  parseChapters,
  parseFilters,
  parseLatest,
  parseMangaDetails,
  parseTrending,
  toSearchResult,
  type Filters,
  type ListedManga,
} from "./parsers";

/** The address MangaWorld uses since November 2026. It can be changed in the settings. */
export const DEFAULT_DOMAIN = "https://www.mangaworld.me";
const DOMAIN_KEY = "domain";

/** What a search carries besides its title: the filters of the archive. */
export type SearchMetadata = {
  genres?: Record<string, "included" | "excluded">;
  types?: string[];
  status?: string[];
};

type PageMetadata = { page: number };

export function normalizedDomain(value: string): string {
  let domain = value.trim().replace(/\/+$/, "");
  if (domain.length > 0 && !/^https?:\/\//i.test(domain)) domain = `https://${domain}`;
  return domain;
}

function baseUrl(): string {
  const stored = Application.getState(DOMAIN_KEY);
  return typeof stored === "string" && stored.length > 0 ? stored : DEFAULT_DOMAIN;
}

/** The archive URL for a search, a sorted list or a genre. */
export function archiveUrl(
  base: string,
  page: number,
  options: { keyword?: string; sort?: string; metadata?: SearchMetadata },
): string {
  const url = new URL(base).addPathComponent("archive");
  const keyword = options.keyword?.trim() ?? "";
  if (keyword.length > 0) url.setQueryItem("keyword", keyword);
  const genres = Object.entries(options.metadata?.genres ?? {});
  const included = genres.filter(([, state]) => state === "included").map(([id]) => id);
  const excluded = genres.filter(([, state]) => state === "excluded").map(([id]) => id);
  if (included.length > 0) url.setQueryItem("genre", included);
  if (excluded.length > 0) url.setQueryItem("exclude", excluded);
  if ((options.metadata?.types ?? []).length > 0) url.setQueryItem("type", options.metadata!.types!);
  if ((options.metadata?.status ?? []).length > 0) url.setQueryItem("status", options.metadata!.status!);
  if (options.sort) url.setQueryItem("sort", options.sort);
  if (page > 1) url.setQueryItem("page", String(page));
  return url.toString();
}

/** MangaWorld's CDN answers without it today; sending it keeps the images working if that changes. */
class RefererInterceptor extends PaperbackInterceptor {
  override async interceptRequest(request: Request): Promise<Request> {
    return { ...request, headers: { ...request.headers, referer: `${baseUrl()}/` } };
  }

  override async interceptResponse(_request: Request, _response: Response, data: ArrayBuffer): Promise<ArrayBuffer> {
    return data;
  }
}

type MangaWorldImplementation = ExtensionImpl<typeof pbconfig>;

export class MangaWorldITAExtension implements MangaWorldImplementation {
  private readonly rateLimiter = new BasicRateLimiter("rateLimiter", {
    numberOfRequests: 5,
    bufferInterval: 1,
    ignoreImages: true,
  });
  private readonly referer = new RefererInterceptor("referer");
  private readonly cookies = new CookieStorageInterceptor({ storage: "stateManager" });
  private filters: Filters | undefined;

  async initialise(): Promise<void> {
    this.rateLimiter.registerInterceptor();
    this.referer.registerInterceptor();
    this.cookies.registerInterceptor();
  }

  // MARK: Network

  private async fetchHtml(url: string): Promise<string> {
    const request: Request = { url, method: "GET" };
    const [response, data] = await Application.scheduleRequest(request);
    const html = Application.arrayBufferToUTF8String(data);
    if ((response.status === 403 || response.status === 503) && /challenge-platform|cf-chl|Just a moment/i.test(html)) {
      throw new CloudflareError({ url: baseUrl(), method: "GET" }, "MangaWorld chiede la verifica Cloudflare.");
    }
    if (response.status >= 400) {
      throw new Error(`MangaWorld ha risposto ${response.status} per ${url}`);
    }
    return html;
  }

  async saveCloudflareBypassCookies(cookies: Cookie[]): Promise<void> {
    for (const cookie of cookies) this.cookies.setCookie(cookie);
  }

  private async loadFilters(): Promise<Filters> {
    if (!this.filters) this.filters = parseFilters(await this.fetchHtml(`${baseUrl()}/archive`));
    return this.filters;
  }

  // MARK: Discover

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    return [
      { id: "trending", title: "Capitoli di tendenza", type: DiscoverSectionType.featured },
      { id: "latest", title: "Ultimi capitoli aggiunti", type: DiscoverSectionType.chapterUpdates },
      { id: "most_read", title: "Più letti", type: DiscoverSectionType.simpleCarousel },
      { id: "newest", title: "Ultime aggiunte", type: DiscoverSectionType.simpleCarousel },
      { id: "top_rated", title: "Più votati", type: DiscoverSectionType.simpleCarousel },
      { id: "genres", title: "Generi", type: DiscoverSectionType.genres },
      { id: "types", title: "Tipologia", type: DiscoverSectionType.genres },
    ];
  }

  async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata: PageMetadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const page = metadata?.page ?? 1;
    const base = baseUrl();
    switch (section.id) {
      case "trending":
        return { items: parseTrending(await this.fetchHtml(base)) };
      case "latest": {
        const result = parseLatest(await this.fetchHtml(page > 1 ? `${base}/?page=${page}` : base));
        return { items: result.items, metadata: result.hasNextPage ? { page: page + 1 } : undefined };
      }
      case "most_read":
      case "newest":
      case "top_rated": {
        const result = parseArchive(await this.fetchHtml(archiveUrl(base, page, { sort: section.id })));
        return {
          items: result.items.map((item) => carouselItem(item)),
          metadata: result.hasNextPage ? { page: page + 1 } : undefined,
        };
      }
      case "genres": {
        const filters = await this.loadFilters();
        return {
          items: filters.genres.map((genre) => ({
            type: "genresCarouselItem",
            name: genre.title,
            searchQuery: { title: "", metadata: { genres: { [genre.id]: "included" } } satisfies SearchMetadata },
          })),
        };
      }
      case "types": {
        const filters = await this.loadFilters();
        return {
          items: filters.types.map((type) => ({
            type: "genresCarouselItem",
            name: type.title,
            searchQuery: { title: "", metadata: { types: [type.id] } satisfies SearchMetadata },
          })),
        };
      }
      default:
        return { items: [] };
    }
  }

  // MARK: Search

  async getSortingOptions(): Promise<SortingOption[]> {
    const filters = await this.loadFilters();
    return filters.sort.map((option) => ({ id: option.id, label: option.title }));
  }

  async getAdvancedSearchForm(query: SearchQuery<SearchMetadata>): Promise<AdvancedSearchForm> {
    return new MangaWorldSearchForm(query.metadata ?? {}, await this.loadFilters());
  }

  async getSearchResults(
    query: SearchQuery<SearchMetadata>,
    metadata: PageMetadata | undefined,
    sortingOption: SortingOption | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    const page = metadata?.page ?? 1;
    const url = archiveUrl(baseUrl(), page, {
      keyword: query.title,
      sort: sortingOption?.id,
      metadata: query.metadata,
    });
    const result = parseArchive(await this.fetchHtml(url));
    return {
      items: result.items.map(toSearchResult),
      metadata: result.hasNextPage ? { page: page + 1 } : undefined,
    };
  }

  // MARK: Series

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const base = baseUrl();
    return parseMangaDetails(await this.fetchHtml(mangaUrl(base, mangaId)), mangaId, base);
  }

  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    return parseChapters(await this.fetchHtml(mangaUrl(baseUrl(), sourceManga.mangaId)), sourceManga);
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const mangaId = chapter.sourceManga.mangaId;
    const html = await this.fetchHtml(chapterUrl(baseUrl(), mangaId, chapter.chapterId));
    const pages = parseChapterPages(html);
    if (pages.length === 0) throw new Error("Nessuna pagina trovata in questo capitolo.");
    return { id: chapter.chapterId, mangaId, pages };
  }

  // MARK: Settings

  async getSettingsForm(): Promise<Form> {
    return new MangaWorldSettingsForm(() => {
      this.filters = undefined;
    });
  }
}

function carouselItem(item: ListedManga): DiscoverSectionItem {
  return {
    type: "simpleCarouselItem",
    mangaId: item.mangaId,
    title: item.title,
    imageUrl: item.imageUrl,
    subtitle: item.subtitle,
    contentRating: item.contentRating,
  };
}

class MangaWorldSettingsForm extends Form {
  constructor(private readonly domainDidChange: () => void) {
    super();
  }

  override getSections(): FormSectionElement<unknown>[] {
    return [
      Section(
        {
          id: "domain",
          header: "Indirizzo del sito",
          footer: `Se MangaWorld cambia di nuovo dominio, scrivi qui quello nuovo (per esempio https://www.mangaworld.xx). Predefinito: ${DEFAULT_DOMAIN}`,
        },
        [
          InputRow("domain", {
            title: "Dominio",
            value: baseUrl(),
            onValueChange: Application.Selector(this as MangaWorldSettingsForm, "domainChanged"),
          }),
          ButtonRow("reset", {
            title: "Ripristina il dominio predefinito",
            onSelect: Application.Selector(this as MangaWorldSettingsForm, "resetDomain"),
          }),
          LabelRow("current", { title: "In uso", subtitle: baseUrl() }),
        ],
      ),
    ];
  }

  async domainChanged(value: string): Promise<void> {
    const domain = normalizedDomain(value);
    Application.setState(domain.length > 0 ? domain : undefined, DOMAIN_KEY);
    this.domainDidChange();
    this.reloadForm();
  }

  async resetDomain(): Promise<void> {
    Application.setState(undefined, DOMAIN_KEY);
    this.domainDidChange();
    this.reloadForm();
  }
}

class MangaWorldSearchForm extends AdvancedSearchForm {
  constructor(
    private metadata: SearchMetadata,
    private readonly filters: Filters,
  ) {
    super();
  }

  override getSearchQueryMetadata(): SearchMetadata {
    return this.metadata;
  }

  override getSections(): FormSectionElement<unknown>[] {
    return [
      Section("genres", [
        TriStateSelectRow("genres", {
          title: "Generi",
          value: this.metadata.genres ?? {},
          layout: "flow",
          items: this.filters.genres,
          allowExclusion: true,
          allowEmptySelection: true,
          onValueChange: Application.Selector(this as MangaWorldSearchForm, "genresChanged"),
        }),
      ]),
      Section("types", [
        SelectRow("types", {
          title: "Tipologia",
          value: this.metadata.types ?? [],
          minItemCount: 0,
          maxItemCount: this.filters.types.length,
          layout: "flow",
          items: this.filters.types,
          onValueChange: Application.Selector(this as MangaWorldSearchForm, "typesChanged"),
        }),
      ]),
      Section("status", [
        SelectRow("status", {
          title: "Stato",
          value: this.metadata.status ?? [],
          minItemCount: 0,
          maxItemCount: this.filters.status.length,
          layout: "list",
          items: this.filters.status,
          onValueChange: Application.Selector(this as MangaWorldSearchForm, "statusChanged"),
        }),
      ]),
    ];
  }

  async genresChanged(value: Record<string, "included" | "excluded">): Promise<void> {
    this.metadata = { ...this.metadata, genres: value };
  }

  async typesChanged(value: string[]): Promise<void> {
    this.metadata = { ...this.metadata, types: value };
  }

  async statusChanged(value: string[]): Promise<void> {
    this.metadata = { ...this.metadata, status: value };
  }
}

export const MangaWorldITA = new MangaWorldITAExtension();
