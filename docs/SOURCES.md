# News sources and image permissions

Reviewed 18 October 2026. Public RSS access is a delivery mechanism, not a blanket content or photo license. Permissions, source author and original URL are recorded independently of model output.

## Source options

| Source | Coverage / delivery | Deployment choice |
| --- | --- | --- |
| [Global Voices](https://globalvoices.org/about/global-voices-attribution-policy/) | International reporting and civil society, culture, politics and technology; [RSS](https://globalvoices.org/feeds/) | Enabled for attributed text under its CC BY terms; original author, story and license links are shown, with an adaptation notice. Third-party photos are excluded from that text permission. |
| [NASA](https://www.nasa.gov/nasa-brand-center/images-and-media/) | Science, space and internationally significant research; official RSS | Enabled text source under applicable media guidelines. Third-party content and imagery are not assumed cleared. Globally irrelevant material is held. |
| [Reuters Connect](https://www.reutersconnect.com/plans-and-pricing) | Broad global wires, business, sport and multimedia; licensed delivery | Obtain an appropriate agreement, including automated-processing rights, before adding its adapter or content. |
| [Associated Press](https://www.ap.org/content/formats/newswires/) | Global news across categories; [Media API](https://api.ap.org/media/v/docs/Feed.htm) | Licensed subscription/API access required. Not a free RSS integration already enabled here. |
| [Guardian Open Platform](https://www.theguardian.com/open-platform/terms-and-conditions) | Multiple categories | Agreement/key required; review commercial and automated-processing terms. Not enabled. |
| [BBC syndication](https://information-syndication.api.bbc.com/) | World, business, technology, science and other sections | Obtain terms covering this use. The world RSS candidate is disabled in the catalog. |
| [DW partnerships](https://amp.dw.com/en/benefit-from-smart-content-made-in-germany/a-19470839) | International and regional reporting | Partnership/terms review before integration. |
| [WHO](https://www.who.int/about/policies/publishing/copyright) and [UN News](https://news.un.org/en/) | Primary health, diplomacy, humanitarian and climate information | Review each applicable license. WHO's cited open license includes a non-commercial restriction; do not assume an advertising-funded site is covered. Not enabled by default. |
| [The Hindu](https://hindugroup.org.in/termsofuse.html) and [Punch](https://punchng.com/) | International desks and regional perspectives | Candidate RSS endpoints are disabled until terms are established. Neither the publisher name nor an RSS image URL grants photo rights. |

Broader category coverage depends on approved feeds and actual source reporting. Configuring nine categories does not create nine legitimate daily stories. Do not fill missing sections with invented news.

## Images

1. The DGX first searches a small set of Wikimedia Commons candidates for the specific source-mentioned subject using [image metadata](https://www.mediawiki.org/wiki/API:Imageinfo). Only supported free/public-domain license labels, attribution and matching subject metadata qualify. File photos are labeled as file photos, not evidence of the current event. Matching is conservative and can still require editorial correction.
2. Only if no qualified candidate exists may an approved publisher photo be selected. Its exact supplied HTTPS URL is retained; no image file is fetched, stored, resized, cropped, recoloured or stripped by this application. Actual photographer/agency credit is mandatory, alongside a linked “Courtesy: Publisher” credit.
3. The `news_publishers` record must contain `imagesEnabled`, approved `imageHosts` and a concrete `imagePermission` reference. Default publisher photography is off. The editorial desk can switch each publisher off with one setting; subsequent public API, HTML and structured-data reads omit those image fields. An already open page may retain an image until it reloads.
4. If rights, credit, relevance or remote delivery fail, show the labeled placeholder. A publisher's licensed agency photograph may require permission from the agency rather than that publisher.

Hotlinking, a courtesy credit and avoiding a local copy do not themselves establish permission. The Hindu's linked terms explicitly restrict photographs and specify licensing/credit conditions. No general claim of legal immunity is made.

This repository has URL-based images, not an upload service. Automatic location/EXIF stripping of user uploads was not present and is not claimed as implemented. Publisher files are intentionally left untouched.
