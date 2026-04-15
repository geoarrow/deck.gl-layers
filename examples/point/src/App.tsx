import type { Layer, PickingInfo } from "@deck.gl/core";
import type { MapboxOverlayProps } from "@deck.gl/mapbox";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { GeoArrowScatterplotLayer } from "@geoarrow/deck.gl-layers";
import * as arrow from "apache-arrow";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useState } from "react";
import { Map as MaplibreMap, useControl } from "react-map-gl/maplibre";

const GEOARROW_POINT_DATA =
  "http://localhost:8080/2019-01-01_performance_mobile_tiles.feather";

const INITIAL_VIEW_STATE = {
  longitude: 0,
  latitude: 20,
  zoom: 2,
  pitch: 0,
  bearing: 0,
};

const MAP_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

function DeckGLOverlay(props: MapboxOverlayProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay(props));
  overlay.setProps(props);
  return null;
}

export default function App() {
  const [table, setTable] = useState<arrow.Table | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      const data = await fetch(GEOARROW_POINT_DATA);
      const buffer = await data.arrayBuffer();
      setTable(arrow.tableFromIPC(buffer));
    };
    if (!table) {
      fetchData().catch(console.error);
    }
  }, [table]);

  const onClick = (info: PickingInfo) => {
    if (info.object) {
      console.log(JSON.stringify(info.object.toJSON()));
    }
  };

  const layers: Layer[] = [];
  let batchIndex = 0;
  for (const batch of table?.batches ?? []) {
    layers.push(
      new GeoArrowScatterplotLayer({
        id: `geoarrow-points-${batchIndex}`,
        data: batch,
        getFillColor: batch.getChild("colors")!.data[0],
        opacity: 0.3,
        getRadius: ({ index, data }) => {
          const recordBatch = data.data;
          const row = recordBatch.get(index)!;
          return row.avg_d_kbps / 200;
        },
        radiusMinPixels: 1,
        pickable: true,
      }),
    );
    batchIndex += 1;
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <MaplibreMap initialViewState={INITIAL_VIEW_STATE} mapStyle={MAP_STYLE}>
        <DeckGLOverlay layers={layers} interleaved onClick={onClick} />
      </MaplibreMap>

      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          zIndex: 1000,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "20px",
            left: "20px",
            background: "white",
            padding: "16px",
            borderRadius: "8px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            maxWidth: "300px",
            pointerEvents: "auto",
          }}
        >
          <h3 style={{ margin: "0 0 8px 0", fontSize: "16px" }}>
            GeoArrowScatterplotLayer Example
          </h3>
          <p style={{ margin: 0, fontSize: "12px", color: "#666" }}>
            Ookla mobile network performance, 2019-01-01.
          </p>
        </div>
      </div>
    </div>
  );
}
