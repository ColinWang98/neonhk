# Internet Archive place background

This optional source uses the public Advanced Search JSON endpoint at
`https://archive.org/advancedsearch.php`. No account, API key, or database migration
is required. It reads catalog metadata only, not full books, films, recordings,
transcripts, or resident testimony.
Existing session/story caches are not invalidated or backfilled; newly fetched
local context can include this source without regenerating saved stories.

- Search up to two specific place names from visual queries, the map address, or
  nearby Wikidata entities. Whole-Hong-Kong-only searches are skipped.
- Request up to 12 records, retain at most two. Each needs a matching place name
  in its title, coverage, or subject (not an incidental mention in a long synopsis),
  Hong Kong context, a creator, description, and one explicit CC0 1.0, CC BY 4.0,
  or CC BY-SA 4.0 license URL. Restricted, unlicensed, NC/ND, and ambiguous-rights
  records are not imported. A license field is a catalog assertion, not a guarantee
  that the uploader cleared every third-party or privacy right.
- Preserve the supplied publication date precision. Search-index ISO timestamps
  are reduced to the year because they may be normalized catalog dates. Upload timestamps are not
  source dates; catalog geography is not an exact coordinate or a distance.
- Carry the record through `PlaceContext.archiveContext`, spatial retrieval,
  Evidence Packet, optional narrative evidence, and the story fact plan. Records
  remain area-level background, never visible-place identification. Opening and
  story writers may use a short relevant connection, not an invented memory or a
  claim about unexamined full content.
- Keep catalog title, URL, creator and license in stored JSON. The reader's
  expandable archive-source section credits the available background records;
  it does not assert that every record was used in the spoken text.
- Cache searches for a day and share the existing local-context abort deadline.
  A source error is logged as `[local.context] archive_failed` and supplies no
  archive evidence. No retry, replacement source, or narrative fallback is added.

Checks: `node scripts/test-archive-context.mjs`; add `--live` to query the public
service. An empty result is legitimate, not a reason to inject unrelated Hong Kong
material. Public connectivity and real Hong Kong source coverage must be reported
separately from fixture-based tests.

Provider documentation: <https://archive.org/developers/md-read.html>,
<https://archive.org/developers/metadata-schema/index.html>,
<https://archive.org/developers/bots.html>.
