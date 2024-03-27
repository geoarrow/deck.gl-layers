import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { StaticMap, MapContext, NavigationControl } from "react-map-gl";
import DeckGL, { Layer } from "deck.gl";
import { GeoArrowPathLayer } from "@geoarrow/deck.gl-layers";
import * as arrow from "apache-arrow";

const GEOARROW_MULTILINESTRING_DATA =
  "http://localhost:8080/ne_10m_roads_north_america.feather";

const INITIAL_VIEW_STATE = {
  latitude: 40,
  longitude: -90,
  zoom: 4,
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

// https://colorbrewer2.org/#type=sequential&scheme=PuBuGn&n=9
const COLORS_LOOKUP = {
  "3": [255, 247, 251],
  "4": [236, 226, 240],
  "5": [208, 209, 230],
  "6": [166, 189, 219],
  "7": [103, 169, 207],
  "8": [54, 144, 192],
  "9": [2, 129, 138],
  "10": [1, 108, 89],
  "11": [1, 70, 54],
};

function Root() {
  const [table, setTable] = useState<arrow.Table | null>(null);

  useEffect(() => {
    // declare the data fetching function
    const fetchData = async () => {
      const data = await fetch(GEOARROW_MULTILINESTRING_DATA);
      const buffer = await data.arrayBuffer();
      const table = arrow.tableFromIPC(buffer);
      console.log(table);
      setTable(table);
    };

    if (!table) {
      fetchData().catch(console.error);
    }
  });

  const layers: Layer[] = [];

  table &&
    layers.push(
      new GeoArrowPathLayer({
        id: "geoarrow-path",
        data: table,
        getColor: ({ index, data }) => {
          const recordBatch = data.data;
          const row = recordBatch.get(index)!;
          return COLORS_LOOKUP[row["scalerank"]];
        },
        widthMinPixels: 0.8,
        pickable: true,
      }),
    );

  return (
    <DeckGL
      initialViewState={INITIAL_VIEW_STATE}
      controller={true}
      layers={layers}
      // @ts-expect-error
      ContextProvider={MapContext.Provider}
    >
      <StaticMap mapStyle={MAP_STYLE} />
      <NavigationControl style={NAV_CONTROL_STYLE} />
    </DeckGL>
  );
}

/* global document */
const container = document.body.appendChild(document.createElement("div"));
createRoot(container).render(<Root />);
