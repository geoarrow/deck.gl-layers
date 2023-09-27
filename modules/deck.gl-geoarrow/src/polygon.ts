// NOTE: having this file in the examples directory is a hack
// Bundling isn't currently working to load the file from the src directory,
// it fails because the code is getting transpiled to ES5 for some reason, and
// you can't subclass an ES6 class from ES5.
import {
  Accessor,
  Color,
  CompositeLayer,
  CompositeLayerProps,
  Material,
  DefaultProps,
  Layer,
  LayersList,
  assert,
} from "@deck.gl/core/typed";
import { SolidPolygonLayer } from "@deck.gl/layers/typed";
import * as arrow from "apache-arrow";
import { findGeometryColumnIndex } from "./utils.js";

const DEFAULT_COLOR: [number, number, number, number] = [0, 0, 0, 255];

/** All properties supported by GeoArrowPolygonLayer */
export type GeoArrowPolygonLayerProps = _GeoArrowPolygonLayerProps &
  CompositeLayerProps;

/** Properties added by GeoArrowPolygonLayer */
export type _GeoArrowPolygonLayerProps = {
  data: arrow.Table;

  /**
   * The name of the geometry column in the Arrow table. If not passed, expects
   * the geometry column to have the extension type `geoarrow.polygon`.
   */
  geometryColumnName?: string;

  /** Whether to fill the polygons
   * @default true
   */
  filled?: boolean;
  /** Whether to extrude the polygons
   * @default false
   */
  extruded?: boolean;
  /** Whether to generate a line wireframe of the polygon.
   * @default false
   */
  wireframe?: boolean;
  /**
   * (Experimental) If `false`, will skip normalizing the coordinates returned by `getPolygon`.
   * @default true
   */
  _normalize?: boolean;
  /**
   * (Experimental) This prop is only effective with `_normalize: false`.
   * It specifies the winding order of rings in the polygon data, one of 'CW' (clockwise) and 'CCW' (counter-clockwise)
   */
  _windingOrder?: "CW" | "CCW";

  /**
   * (Experimental) This prop is only effective with `XYZ` data.
   * When true, polygon tesselation will be performed on the plane with the largest area, instead of the xy plane.
   * @default false
   */
  _full3d?: boolean;

  /** Elevation multiplier.
   * @default 1
   */
  elevationScale?: number;

  /** Extrusion height accessor.
   * @default 1000
   */
  getElevation?: Accessor<arrow.Table, number>;
  /** Fill color accessor.
   * @default [0, 0, 0, 255]
   */
  getFillColor?: Accessor<arrow.Table, Color>;
  /** Stroke color accessor.
   * @default [0, 0, 0, 255]
   */
  getLineColor?: Accessor<arrow.Table, Color>;

  /**
   * Material settings for lighting effect. Applies if `extruded: true`
   *
   * @default true
   * @see https://deck.gl/docs/developer-guide/using-lighting
   */
  material?: Material;
};

const defaultProps: DefaultProps<GeoArrowPolygonLayerProps> = {
  filled: true,
  extruded: false,
  wireframe: false,
  _normalize: true,
  _windingOrder: "CW",
  _full3d: false,

  elevationScale: { type: "number", min: 0, value: 1 },

  // getPolygon: { type: "accessor", value: (f) => f.polygon },
  getElevation: { type: "accessor", value: 1000 },
  getFillColor: { type: "accessor", value: DEFAULT_COLOR },
  getLineColor: { type: "accessor", value: DEFAULT_COLOR },

  material: true,
};

// function convertCoordsToFixedSizeList(
//   coords:
//     | arrow.Data<arrow.FixedSizeList<arrow.Float64>>
//     | arrow.Data<arrow.Struct<{ x: arrow.Float64; y: arrow.Float64 }>>
// ): arrow.Data<arrow.FixedSizeList<arrow.Float64>> {
//   if (coords.type instanceof arrow.FixedSizeList) {
//     coords.
//   }
// }

export class GeoArrowPolygonLayer<
  ExtraProps extends {} = {}
> extends CompositeLayer<Required<GeoArrowPolygonLayerProps> & ExtraProps> {
  static defaultProps = defaultProps;
  static layerName = "GeoArrowPolygonLayer";

  renderLayers(): Layer<{}> | LayersList | null {
    const { data } = this.props;

    const geometryColumnIndex = findGeometryColumnIndex(
      data.schema,
      "geoarrow.polygon"
    );
    if (geometryColumnIndex === null) {
      console.warn("No geoarrow.polygon column found.");
      return null;
    }

    const geometryColumn = data.getChildAt(geometryColumnIndex);
    if (!geometryColumn) {
      return null;
    }

    const layers: SolidPolygonLayer[] = [];
    for (let i = 0; i < geometryColumn.data.length; i++) {
      // TODO: only make assertions once on schema, not on data
      const arrowData = geometryColumn.data[i];
      assert(arrowData.typeId === arrow.Type.List);

      const geomOffsets = arrowData.valueOffsets;
      assert(arrowData.children.length === 1);
      assert(arrowData.children[0].typeId === arrow.Type.List);

      const ringOffsets = arrowData.children[0].valueOffsets;
      assert(arrowData.children[0].children.length === 1);
      assert(
        arrowData.children[0].children[0].typeId === arrow.Type.FixedSizeList
      );

      const flatCoordinateArray =
        arrowData.children[0].children[0].children[0].values;

      const resolvedRingOffsets = new Int32Array(geomOffsets.length);
      for (let i = 0; i < resolvedRingOffsets.length; ++i) {
        // Perform the lookup into the ringIndices array using the geomOffsets
        // array
        resolvedRingOffsets[i] = ringOffsets[geomOffsets[i]];
      }

      const layer = new SolidPolygonLayer({
        // ...this.props,
        id: `${this.props.id}-geoarrow-point-${i}`,
        data: {
          // Number of geometries
          length: arrowData.length,
          // Offsets into coordinateArray where each polygon starts
          startIndices: resolvedRingOffsets,

          attributes: {
            getPolygon: { value: flatCoordinateArray, size: 2 },
          },
        },
        _normalize: false,
        _windingOrder: "CCW",
        getFillColor: [0, 100, 60, 160],
      });
      layers.push(layer);
    }

    return layers;
  }
}
