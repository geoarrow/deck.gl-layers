import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { StaticMap, MapContext, NavigationControl } from "react-map-gl";
import DeckGL, { Layer, PickingInfo } from "deck.gl/typed";
import { GeoArrowScatterplotLayer } from "@geoarrow/deck.gl-layers";
import * as arrow from "apache-arrow";
import type { Loader, LoaderWithParser } from "@loaders.gl/loader-utils";

const GEOARROW_POINT_DATA =
  "http://localhost:8080/2019-01-01_performance_mobile_tiles.feather";

const INITIAL_VIEW_STATE = {
  latitude: 20,
  longitude: 0,
  zoom: 2,
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

const GeoArrowIPCLoader: LoaderWithParser = {
  name: "geoarrow-ipc",
  id: "geoarrow-ipc",
  module: "arrow",
  version: "latest",
  worker: false,
  options: {},
  extensions: ["feather", "arrow"],
  mimeTypes: [],
  binary: true,
  parse: async (arrayBuffer) => {
    return arrow.tableFromIPC(arrayBuffer);
  },
};

function Root() {
  const onClick = (info: PickingInfo) => {
    if (info.object) {
      console.log(JSON.stringify(info.object.toJSON()));
    }
  };

  const layers: Layer[] = [];

  layers.push(
    new GeoArrowScatterplotLayer({
      id: "geoarrow-points",
      data: GEOARROW_POINT_DATA,
      getFillColor: ((table: arrow.Table) => table.getChild("colors")!),
      radiusMinPixels: 1.5,
      getPointRadius: 10,
      pointRadiusMinPixels: 0.8,
      pickable: true,
      loaders: [GeoArrowIPCLoader],
    })
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
