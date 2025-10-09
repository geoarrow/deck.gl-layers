## Example: Use `@geoarrow/deck.gl-layers` with GeoArrow polygon data

## Data for example:

```
wget https://usbuildingdata.blob.core.windows.net/usbuildings-v2/Utah.geojson.zip
poetry install
poetry run python generate_data.py
```

## Serve data

```
npx http-server --cors
```

## Usage

To install dependencies, run `npm install` at the top level of this workspace, not in this directory.

Commands:

* `npm start` is the development target, to serve the app and hot reload.
* `npm run build` is the production target, to create the final bundle and write to disk.
