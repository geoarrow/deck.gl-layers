# Example: GeoArrowScatterplotLayer

Visualize point data from a GeoArrow table using `GeoArrowScatterplotLayer`.
Data: Ookla mobile network performance tile centroids, 2019-01-01.

## Generate the data

The example expects a local GeoArrow feather file. Install
[`uv`](https://docs.astral.sh/uv/), then from this directory run:

```
uv run generate_data.py
```

This downloads ~150MB of source data and writes
`2019-01-01_performance_mobile_tiles.feather`.

## Serve the data

The file is served over HTTP so the browser can fetch it:

```
npx http-server --cors
```

## Run the example

From the repository root, install dependencies once:

```
pnpm install
```

Then from this directory:

- `pnpm dev` — start the dev server (http://localhost:3000) with hot reload
- `pnpm build` — build the production bundle
- `pnpm preview` — preview the production build
