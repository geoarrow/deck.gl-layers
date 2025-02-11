# Changelog

## [0.3.0] - 2025-02-11

This version includes major improvements over 0.2.

### New Features:

- Run `earcut` on a web worker to improve rendering performance of the `SolidPolygonLayer`  by @kylebarron in https://github.com/geoarrow/deck.gl-layers/pull/85
  - Earcut main thread fallback by @kylebarron in https://github.com/geoarrow/deck.gl-layers/pull/92
-
- New layer types:
  - Add Arc layer by @kylebarron in https://github.com/geoarrow/deck.gl-layers/pull/63
  - Add heatmap layer by @kylebarron in https://github.com/geoarrow/deck.gl-layers/pull/64
  - Add column layer and h3 hexagon layer by @kylebarron in https://github.com/geoarrow/deck.gl-layers/pull/68
  - Add GeoArrowTextLayer by @kylebarron in https://github.com/geoarrow/deck.gl-layers/pull/70
  - GeoArrow-based Trips Layer by @kylebarron in https://github.com/geoarrow/deck.gl-layers/pull/34
  - polygon layer by @kylebarron in https://github.com/geoarrow/deck.gl-layers/pull/79
  - Start implementation of point cloud layer by @naomatheus in https://github.com/geoarrow/deck.gl-layers/pull/96

### What's Changed

- Simplified accessor validation by @kylebarron in https://github.com/geoarrow/deck.gl-layers/pull/69
- Text example & Fix text rendering by @kylebarron in https://github.com/geoarrow/deck.gl-layers/pull/72
- compute table offsets by @kylebarron in https://github.com/geoarrow/deck.gl-layers/pull/91
- Fix error when no geometry column found by @kylebarron in https://github.com/geoarrow/deck.gl-layers/pull/94
- function accessors by @kylebarron in https://github.com/geoarrow/deck.gl-layers/pull/100
- Wrap worker instantiation in try/catch; fix for non-served HTML files by @kylebarron in https://github.com/geoarrow/deck.gl-layers/pull/108
- Export PointCloudLayer through top-level index.ts by @kylebarron in https://github.com/geoarrow/deck.gl-layers/pull/110
- Fix picking in the polygon layer by @kylebarron in https://github.com/geoarrow/deck.gl-layers/pull/113
- Publish beta with fixed PolygonLayer by @kylebarron in https://github.com/geoarrow/deck.gl-layers/pull/115
- Fix bundling for loading from CDN by @kylebarron in https://github.com/geoarrow/deck.gl-layers/pull/111
- Prefer user input over defaults by @kylebarron in https://github.com/geoarrow/deck.gl-layers/pull/119
- fix arrow bundle by @atmorling in https://github.com/geoarrow/deck.gl-layers/pull/122
- Support deck.gl v9 by @kylebarron in https://github.com/geoarrow/deck.gl-layers/pull/112
- Support separated (struct) coordinates for all applicable layers by @gmoney1729 in https://github.com/geoarrow/deck.gl-layers/pull/139

## New Contributors

- @naomatheus made their first contribution in https://github.com/geoarrow/deck.gl-layers/pull/96
- @gmoney1729 made their first contribution in https://github.com/geoarrow/deck.gl-layers/pull/139

**Full Changelog**: https://github.com/geoarrow/deck.gl-layers/compare/v0.2.0...v0.3.0

## [0.2.0] - 2023-10-21

### What's Changed

- Correctly forward props by @kylebarron in https://github.com/geoarrow/deck.gl-layers/pull/46
- Cleaner data reproductions for examples by @kylebarron in https://github.com/geoarrow/deck.gl-layers/pull/45
- Fix multipolygon rendering by @kylebarron in https://github.com/geoarrow/deck.gl-layers/pull/48
- Fixed multi polygon attribute rendering by @kylebarron in https://github.com/geoarrow/deck.gl-layers/pull/49
- Implement picking by @kylebarron in https://github.com/geoarrow/deck.gl-layers/pull/47
- improved typing for picking info by @kylebarron in https://github.com/geoarrow/deck.gl-layers/pull/50
- Triangulate ourselves w/ earcut (fix with holes) by @kylebarron in https://github.com/geoarrow/deck.gl-layers/pull/51

**Full Changelog**: https://github.com/geoarrow/deck.gl-layers/compare/v0.1.0...v0.2.0

## [0.1.0] - 2023-10-16

- Initial public release.
- Initial support for `GeoArrowScatterplotLayer`, `GeoArrowPathLayer`, and `GeoArrowSolidPolygonLayer`.
