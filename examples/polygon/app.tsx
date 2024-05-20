import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { StaticMap, MapContext, NavigationControl } from "react-map-gl";
import DeckGL, { Layer, PickingInfo } from "deck.gl";
import { GeoArrowPolygonLayer } from "@geoarrow/deck.gl-layers";
import * as arrow from "apache-arrow";

// const GEOARROW_POLYGON_DATA = "http://localhost:8080/small.feather";

const GEOARROW_POLYGON_DATA = "http://localhost:8080/nybb.feather";

const INITIAL_VIEW_STATE = {
  latitude: 40.71,
  // longitude: -111.9,
  longitude: -74.0,
  zoom: 9,
  bearing: 0,
  pitch: 0,
};

const MAP_STYLE =
  "https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json";
const NAV_CONTROL_STYLE = {
  position: "absolute",
  top: 10,
  left: 10,
};

function Root() {
  const onClick = (info: PickingInfo) => {
    if (info.object) {
      console.log(info.object["BoroName"]);
    }
  };

  const [table, setTable] = useState<arrow.Table | null>(null);

  useEffect(() => {
    // declare the data fetching function
    const fetchData = async () => {
      const data = await fetch(GEOARROW_POLYGON_DATA);
      const buffer = await data.arrayBuffer();
      const table = arrow.tableFromIPC(buffer);
      const table2 = new arrow.Table(table.batches.slice(0, 10));
      window.table = table2;
      setTable(table2);
    };

    if (!table) {
      fetchData().catch(console.error);
    }
  });

  const layers: Layer[] = [];

  table &&
    layers.push(
      new GeoArrowPolygonLayer({
        id: "geoarrow-polygons",
        stroked: true,
        filled: true,
        data: table,
        getFillColor: [0, 100, 60, 160],
        getLineColor: [255, 0, 0],
        lineWidthMinPixels: 1,
        extruded: false,
        wireframe: true,
        // getElevation: 0,
        pickable: true,
        positionFormat: "XY",
        _normalize: false,
        autoHighlight: false,
        earcutWorkerUrl: new URL(
          "https://cdn.jsdelivr.net/npm/@geoarrow/geoarrow-js@0.3.0-beta.1/dist/earcut-worker.min.js",
        ),
      }),
    );

  return (
    <DeckGL
      initialViewState={INITIAL_VIEW_STATE}
      controller={true}
      layers={layers}
      ContextProvider={MapContext.Provider}
      onClick={onClick}
    >
      <StaticMap mapStyle={MAP_STYLE} />
      <NavigationControl style={NAV_CONTROL_STYLE} />
    </DeckGL>
  );
}

/* global document */
const container = document.body.appendChild(document.createElement("div"));
createRoot(container).render(<Root />);
