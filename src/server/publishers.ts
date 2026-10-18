import type { Db } from "mongodb";
import type { Article } from "../types";

export const NEWS_CATEGORIES = ["World", "Politics", "Business", "Technology", "Science", "Climate", "Health", "Sports", "Culture"] as const;
export interface Publisher {
  _id: string; name: string; feedUrl: string; articleHosts: string[]; category: string;
  enabled: boolean; textAllowed: boolean; textLicense: string; termsUrl: string; autoPublish: boolean;
  requireAuthor?: boolean; imagesEnabled: boolean; imageHosts: string[]; imagePermission: string;
}
export const publisherCatalog: Publisher[] = [
  { _id: "global-voices", name: "Global Voices", feedUrl: "https://globalvoices.org/feed/", articleHosts: ["globalvoices.org"], category: "World", enabled: true, textAllowed: true, textLicense: "CC BY 3.0; adapted summary", termsUrl: "https://globalvoices.org/about/global-voices-attribution-policy/", autoPublish: true, requireAuthor: true, imagesEnabled: false, imageHosts: [], imagePermission: "" },
  { _id: "nasa", name: "NASA", feedUrl: "https://www.nasa.gov/feed/", articleHosts: ["www.nasa.gov", "science.nasa.gov"], category: "Science", enabled: true, textAllowed: true, textLicense: "NASA media usage guidelines; third-party material excluded", termsUrl: "https://www.nasa.gov/nasa-brand-center/images-and-media/", autoPublish: true, imagesEnabled: false, imageHosts: [], imagePermission: "" },
  { _id: "bbc-world", name: "BBC News", feedUrl: "https://feeds.bbci.co.uk/news/world/rss.xml", articleHosts: ["www.bbc.com", "www.bbc.co.uk"], category: "World", enabled: false, textAllowed: false, textLicense: "Publisher agreement required for this use", termsUrl: "https://www.bbc.com/usingthebbc/terms/", autoPublish: false, imagesEnabled: false, imageHosts: [], imagePermission: "" },
  { _id: "al-jazeera", name: "Al Jazeera", feedUrl: "https://www.aljazeera.com/xml/rss/all.xml", articleHosts: ["www.aljazeera.com"], category: "World", enabled: false, textAllowed: false, textLicense: "Publisher agreement required for this use", termsUrl: "https://www.aljazeera.com/terms-and-conditions", autoPublish: false, imagesEnabled: false, imageHosts: [], imagePermission: "" },
  { _id: "the-hindu", name: "The Hindu", feedUrl: "https://www.thehindu.com/news/international/feeder/default.rss", articleHosts: ["www.thehindu.com"], category: "World", enabled: false, textAllowed: false, textLicense: "Publisher agreement required for this use", termsUrl: "https://hindugroup.org.in/termsofuse.html", autoPublish: false, imagesEnabled: false, imageHosts: [], imagePermission: "" },
  { _id: "punch", name: "Punch", feedUrl: "https://punchng.com/topics/world-news/feed/", articleHosts: ["punchng.com"], category: "World", enabled: false, textAllowed: false, textLicense: "Publisher agreement required for this use", termsUrl: "https://punchng.com/", autoPublish: false, imagesEnabled: false, imageHosts: [], imagePermission: "" },
];
export class Publishers {
  constructor(readonly db: Db) {}
  async seed() {
    for (const publisher of publisherCatalog) await this.db.collection<Publisher>("news_publishers").updateOne({ _id: publisher._id }, { $setOnInsert: publisher }, { upsert: true });
  }
  async list() { return this.db.collection<Publisher>("news_publishers").find().sort({ name: 1 }).toArray(); }
  async get(id: string) { return this.db.collection<Publisher>("news_publishers").findOne({ _id: id }); }
  async setImages(id: string, enabled: boolean) {
    const publisher = await this.get(id);
    if (!publisher) throw new Error("Unknown publisher");
    if (enabled && (!publisher.imagePermission || !publisher.imageHosts.length)) throw new Error("Record publisher/rights-holder permission and approved image hosts before enabling photos");
    await this.db.collection<Publisher>("news_publishers").updateOne({ _id: id }, { $set: { imagesEnabled: enabled } });
  }
}

export async function publicImages(db: Db, articles: Article[]): Promise<Article[]> {
  const ids = [...new Set(articles.filter(a => a.imageType === "publisher").map(a => a.publisherId).filter(Boolean))] as string[];
  if (!ids.length) return articles;
  const policies = await db.collection<Publisher>("news_publishers").find({ _id: { $in: ids } }).toArray();
  return articles.map(article => {
    if (article.imageType !== "publisher") return article;
    const policy = policies.find(p => p._id === article.publisherId);
    let allowed = false;
    try { allowed = Boolean(policy?.imagesEnabled && policy.imagePermission && policy.imageHosts.includes(new URL(article.imageUrl || "").hostname)); } catch {}
    if (allowed) return article;
    const { imageUrl, imageCredit, imageLicense, imageSource, imageCaption, ...rest } = article;
    return rest;
  });
}
