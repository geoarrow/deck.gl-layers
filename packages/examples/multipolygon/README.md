## Example: Use `@geoarrow/deck.gl-layers` with GeoArrow MultiPolygon data

## Data for example:

Download [Admin 0 - Countries](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/) data.

```
wget https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_0_countries.zip
poetry install
poetry run python generate_data.py
```

## Serve data

```
npx http-server --cors
```

## Usage

To install dependencies:

```bash
npm install
# or
yarn
```

Commands:

* `npm start` is the development target, to serve the app and hot reload.
* `npm run build` is the production target, to create the final bundle and write to disk.
