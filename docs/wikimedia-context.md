# Wikivoyage and Wikimedia Commons context

Both sources use the public MediaWiki Action API. No account, API key, database
migration, or paid provider is required. `WIKIMEDIA_USER_AGENT` remains optional;
the existing application identifier is used by default.

## Retrieval

- Wikivoyage: search primary article coordinates within 10 km; select the nearest
  guide only if its reference coordinate is within 5 km. Fetch at most one 1,400
  character plain-text extract. This coordinate is not an administrative boundary
  or evidence that a particular shop belongs to the guide's area.
- Commons: query coordinate-tagged image files within the requested radius,
  clamped to 100–500 m. Retrieve up to ten records and retain at most two, ranked
  by distance and the provided place-name queries. Keep the caption, file-page
  link, image/thumbnail URLs, creator/credit, and per-file licence. Exclude files
  missing attribution/licensing or declaring restrictions. Do not download or
  display photographs automatically.
- Only explicit `DateTimeOriginal` metadata supplies a capture date. Neither an
  upload timestamp nor a date inferred from a filename counts as a capture date.
- Requests run alongside existing context retrieval, share its eight-second
  deadline, and use Next's 24-hour fetch cache. Upstream failures are logged by
  source; they do not fabricate replacement records or switch providers.

## Story use

`PlaceContext.sourceNotes` holds the guide and `commonsMedia` holds photo records.
These flow into scene openings, Spatial RAG candidates, and fragment evidence.
The evidence packet retains up to one guide and two photo claims independently
of the map-candidate limit, so dense POI results do not discard all new context.
The existing narrative relevance/ranking step may still omit irrelevant material.

Both sources are always `background_only` / `area_level_only`. They do not enter
the visual identity verifier. A photo caption describes another photograph; it
does not identify the selected facade, establish present conditions, or prove a
change over time. Guides should not supply current prices or opening hours.

Session and fragment JSON storage already retains these fields. Existing cached
stories are unchanged; new context is used when context/story generation runs.
No place-memory ingestion or unrelated story-cache invalidation is introduced.

## Reuse and attribution

Wikivoyage text is CC BY-SA 4.0. Commons files have individual licences. Source
links and attribution/licence metadata travel with the evidence. If a later UI
displays images or republishes extracts, it must present the applicable credit,
licence links, and share-alike obligations, not just a generic Wikimedia credit.

References:

- https://www.mediawiki.org/wiki/API:Geosearch
- https://www.mediawiki.org/wiki/API:Imageinfo
- https://commons.wikimedia.org/wiki/Commons:API
- https://en.wikivoyage.org/wiki/Wikivoyage:Copyleft

Run deterministic retrieval-to-evidence checks with
`node scripts/test-wikimedia-context.mjs`. Add `--live` to also query the public
services around Whampoa. Live checks need network access, not model API keys.
