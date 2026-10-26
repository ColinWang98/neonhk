# Streetscape 360

## Deployment

1. Set `OPEN3DHK_API_KEY` in the server's environment (Vercel Production and Preview as appropriate).
2. For an existing database, run `supabase-open3dhk-upgrade.sql` in the Supabase SQL editor. New installations use `supabase-setup.sql`.
3. Deploy and choose **Streetscape 360 (Hong Kong)** in the map's source selector.

The key must have access to the Streetscape service. This is not a Google Maps key. The application never sends it to the browser. If LandsD applies domain restrictions to the renderer or key, the deployed domain must be approved as well.

## Integration

- `/api/open3dhk/search`: Hong Kong coordinates to nearby panorama records. Authentication, workspace layers and nearby search follow the official MMS SDK. Public WMS metadata supplies a nearby surveyed camera location.
- `/api/open3dhk/asset/...`: signed, expiring imagery references, restricted to the official imagery hosts. The proxy forwards byte ranges for packed `.gtpanos` imagery and serves individual `.pano` tiles. It does not persist source panoramas.
- `public/open3dhk-viewer.js`: the official `GS.module-20250508.js` renderer, isolated in an iframe. The renderer already uses Three.js. No SDK source or demo API key is copied into the app.
- Scene summaries and fragment crops use actual rendered canvas captures, not a Google Static image from a different camera. The existing crop storage and story pipeline are reused.
- Fragment corners are saved as world heading/pitch and reprojected through the renderer's camera. History restores the saved heading, pitch and field of view. The renderer has no public orientation setter; the version-specific adapter uses its `_lng` and `_lat` fields, matching the pinned renderer's `render()` implementation.
- Saved sessions reconstruct their original panorama by its ID. Missing imagery produces an error rather than substituting another provider or viewpoint. Imagery references expire after six hours; reopening the saved scene from the map obtains fresh references.
- Local context and nearby continuation use the selected source. LandsD's imagery supplies spatial evidence, not shop identity or current business facts.

Attribution remains visible in the viewer. No model, prompt or voice provider is changed by selecting this imagery source.

## Verification

`node scripts/test-open3dhk.mjs` checks service errors, signed imagery references, byte-range forwarding and exact panorama restoration with controlled responses. Browser tests should also check the actual official renderer with panorama tiles, rotation, zoom, crop capture, mobile layout, and saved-box restoration.

Local controlled tests do not establish that a production key is authorised or that a particular street is covered. Cloud end-to-end acceptance requires the deployed environment and its real key.

Official documentation: https://portal.csdi.gov.hk/csdi-webpage/apidoc/streetscape-360-api

SDK demonstration: https://3d.map.gov.hk/mapviewer/files/api/5za3fg7s/
