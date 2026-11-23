import { ContentRating, SourceIntents, type ExtensionInfo } from "@paperback/types";

export default {
  name: "MangaWorld ITA",
  description: "Manga, manhwa e manhua in italiano da MangaWorld (www.mangaworld.me).",
  version: "1.0.1",
  icon: "icon.png",
  language: "it",
  contentRating: ContentRating.EVERYONE,
  capabilities: [
    SourceIntents.CHAPTER_PROVIDING,
    SourceIntents.DISCOVER_SECTION_PROVIDING,
    SourceIntents.SEARCH_RESULT_PROVIDING,
    SourceIntents.SETTINGS_FORM_PROVIDING,
    SourceIntents.CLOUDFLARE_BYPASS_PROVIDING,
  ],
  badges: [],
  developers: [{ name: "dimpemekug", github: "https://github.com/dimpemekug" }],
} satisfies ExtensionInfo;
