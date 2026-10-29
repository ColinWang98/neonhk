# Free Hong Kong location knowledge

These sources augment the existing local-context, Spatial RAG, Evidence Packet and
story-fact selection. They do not replace visual identification or add a model call.
No new API keys, database migration or paid provider is required. Existing session
and fragment JSON retain the source records and evidence metadata.

## Sources

| Source | Retrieval | Scope |
| --- | --- | --- |
| AMO heritage trails | CSDI WFS, bounded geographic query | Up to three nearby stops, names, addresses and trail membership. Not building dates. |
| Old and Valuable Trees / Stonewall Trees | CSDI WFS, bounded geographic query | Up to two nearby species/location records. Inspection, risk and condition fields are not used. |
| City in Time | Tourism Commission public JSON directory | Up to three nearby designated locations. No historical narratives, panoramas, movies or app assets are fetched. |
| Hong Kong ICH inventory | Six curated factual summaries from the December 2024 official inventory | Matched to approximate locality anchors or explicit food subject terms, at most two. Not the full database or an automatic inventory sync. |
| GBIF | Occurrence API, Hong Kong + geographic bounds | At most one dated species observation, queried only for nature-related fragment topics. Only CC0 / CC BY records, no contributor identities or photographs. |

The cultural summaries cover Tai Hang and Pok Fu Lam village fire dragons, Cheung
Chau Jiao Festival, Sheung Wan Man Mo Temple, milk tea making and ding ding candy.
They do not supply precise event coordinates, current festival dates, a shop menu,
or proof that a ritual is visible. Their December 2024 source version is explicit.
Regional traditions require proximity to an approximate locality anchor; a shop
named after a distant district cannot relocate that district's tradition.

## Flow and limits

`/api/local-context` accepts optional `topic` parameters derived from fragment
analysis (separate from named-entity `q` queries). Source requests share the
existing eight-second deadline and run alongside other context lookups. Successful
public responses use Next's 24-hour fetch cache. Non-Hong-Kong coordinates do not
query these sources. A failed source is logged and contributes no records; there
is no retry, provider substitution or invented replacement data.

Source coordinates remain separate from the panorama coordinate. WFS boxes use
explicit `urn:ogc:def:crs:EPSG::4326` latitude/longitude order: the two services have
different default CRSs. Results are distance-filtered again after retrieval.

All new RAG candidates are `area_background` / `background_only`. The Evidence
Packet admits at most **two** new claims independently of the map-candidate cap.
Locality- or subject-matched cultural records do not need a matching visual keyword;
heritage stops within 150 m may also supply area background. Nature records still
need relevant visual topics, and parking is not a park cue. Directory entries are
never story claims.
Source text, links, attribution and license fields remain attached. GBIF event
dates use `observedAt`, not photo capture or publication dates. Coordinates with
reported uncertainty over 100 m, future dates, and incompatible licenses are
excluded. An observation is not a current sighting or evidence of abundance.

The existing story planner may select these claims as optional supporting facts,
never visual identity anchors. The opening may use at most one relevant detail;
the writer may use at most two. Heritage stops and City in Time directory points
also feed Continue nearby, with the existing Street View availability check.

Fictional persona experiences cannot establish ownership, relationships, routines,
or destinations for specific visible people or objects. Writer, repair, judge and
opening prompts share this boundary. Openings use conversational area context,
not walking instructions or interface directions.

Narrative cache version is 21; opening cache version is 4. Existing saved records
are not deleted or rewritten, but old generations are not reused as current ones.

## Access and rights

- Government datasets: retain DATA.GOV.HK attribution and its terms link.
- City in Time: the open location directory is separate from the app/site's
  restricted historical media and stories.
- ICH: short factual summaries, not reproduced articles or PDF pages; source
  attribution does not purport to grant a blanket reuse license for the collection.
- GBIF: preserve each accepted record's individual license and occurrence link.
- Gwulo: not imported. Publicly readable comments are not evidence of permission
  to bulk collect, republish or send personal recollections to generation services.

Sources:

- https://data.gov.hk/en-data/dataset/hk-devb-htrails-heritage-trails-established-by-amo
- https://data.gov.hk/en-data/dataset/hk-devb-ovt-ovt-and-stonewall
- https://www.tourism.gov.hk/datagovhk/city_in_time/city_in_time_info.json
- https://www.cityintime.hk/en/terms-and-conditions/
- https://www.hkichdb.gov.hk/download/6b614fd1-b768-47f2-909d-d2fab9b764dd
- https://techdocs.gbif.org/en/openapi/
- https://data.gov.hk/en/terms-and-conditions

## Checks

```sh
node scripts/test-location-knowledge.mjs
node scripts/test-location-knowledge.mjs --live
node scripts/test-wikimedia-context.mjs
npm run typecheck
npm run build
```

The live check reads only public endpoints, without model, TTS or private keys.
It checks known Garden Road trail and Sha Lo Wan tree coordinates, Edinburgh Place,
and a geographically bounded GBIF response (which may contain no eligible records).
CSDI's versioned layer names are recorded in the adapter; upstream schema changes
should surface as source errors and require updating them, not fabricated results.
