import {
  Accessor,
  Color,
  CompositeLayer,
  CompositeLayerProps,
  DefaultProps,
  Layer,
  LayersList,
  Position,
  Unit,
  assert,
} from "@deck.gl/core/typed";
import { PathLayer } from "@deck.gl/layers/typed";
import * as arrow from "apache-arrow";

const DEFAULT_COLOR: [number, number, number, number] = [0, 0, 0, 255];

/** All properties supported by GeoArrowLineStringLayer */
export type GeoArrowLineStringLayerProps = _GeoArrowLineStringLayerProps &
  CompositeLayerProps;

/** Properties added by GeoArrowLineStringLayer */
export type _GeoArrowLineStringLayerProps = {
  data: arrow.Table;

  /**
   * The name of the geometry column in the Arrow table. If not passed, expects
   * the geometry column to have the extension type `geoarrow.point`.
   */
  geometryColumnName?: string;
  /** The units of the line width, one of `'meters'`, `'common'`, and `'pixels'`
   * @default 'meters'
   */
  widthUnits?: Unit;
  /**
   * Path width multiplier.
   * @default 1
   */
  widthScale?: number;
  /**
   * The minimum path width in pixels. This prop can be used to prevent the path from getting too thin when zoomed out.
   * @default 0
   */
  widthMinPixels?: number;
  /**
   * The maximum path width in pixels. This prop can be used to prevent the path from getting too thick when zoomed in.
   * @default Number.MAX_SAFE_INTEGER
   */
  widthMaxPixels?: number;
  /**
   * Type of joint. If `true`, draw round joints. Otherwise draw miter joints.
   * @default false
   */
  jointRounded?: boolean;
  /**
   * Type of caps. If `true`, draw round caps. Otherwise draw square caps.
   * @default false
   */
  capRounded?: boolean;
  /**
   * The maximum extent of a joint in ratio to the stroke width. Only works if `jointRounded` is `false`.
   * @default 4
   */
  miterLimit?: number;
  /**
   * If `true`, extrude the path in screen space (width always faces the camera).
   * If `false`, the width always faces up (z).
   * @default false
   */
  billboard?: boolean;
  /**
   * (Experimental) If `'loop'` or `'open'`, will skip normalizing the coordinates returned by `getPath` and instead assume all paths are to be loops or open paths.
   * When normalization is disabled, paths must be specified in the format of flat array. Open paths must contain at least 2 vertices and closed paths must contain at least 3 vertices.
   * @default null
   */
  _pathType?: null | "loop" | "open";
  // /**
  //  * Path geometry accessor.
  //  */
  // getPath?: AccessorFunction<DataT, PathGeometry>;
  /**
   * Path color accessor.
   * @default [0, 0, 0, 255]
   */
  getColor?: Accessor<arrow.Table, Color | Color[]>;
  /**
   * Path width accessor.
   * @default 1
   */
  getWidth?: Accessor<arrow.Table, number | number[]>;
  /**
   * @deprecated Use `jointRounded` and `capRounded` instead
   */
  rounded?: boolean;
};

const defaultProps: DefaultProps<GeoArrowLineStringLayerProps> = {
  widthUnits: "meters",
  widthScale: { type: "number", min: 0, value: 1 },
  widthMinPixels: { type: "number", min: 0, value: 0 },
  widthMaxPixels: { type: "number", min: 0, value: Number.MAX_SAFE_INTEGER },
  jointRounded: false,
  capRounded: false,
  miterLimit: { type: "number", min: 0, value: 4 },
  billboard: false,
  _pathType: null,

  // getPath: { type: "accessor", value: (object) => object.path },
  getColor: { type: "accessor", value: DEFAULT_COLOR },
  getWidth: { type: "accessor", value: 1 },

  // deprecated props
  rounded: { deprecatedFor: ["jointRounded", "capRounded"] },
};

function findGeometryColumnIndex(
  schema: arrow.Schema,
  extensionName: string
): number | null {
  const index = schema.fields.findIndex(
    (field) => field.metadata.get("ARROW:extension:name") === extensionName
  );
  return index !== -1 ? index : null;
}

// function convertCoordsToFixedSizeList(
//   coords:
//     | arrow.Data<arrow.FixedSizeList<arrow.Float64>>
//     | arrow.Data<arrow.Struct<{ x: arrow.Float64; y: arrow.Float64 }>>
// ): arrow.Data<arrow.FixedSizeList<arrow.Float64>> {
//   if (coords.type instanceof arrow.FixedSizeList) {
//     coords.
//   }
// }

export class GeoArrowLineStringLayer<
  ExtraProps extends {} = {}
> extends CompositeLayer<Required<GeoArrowLineStringLayerProps> & ExtraProps> {
  static defaultProps = defaultProps;
  static layerName = "GeoArrowLineStringLayer";

  renderLayers(): Layer<{}> | LayersList | null {
    // console.log("renderLayers");
    const { data } = this.props;

    const geometryColumnIndex = findGeometryColumnIndex(
      data.schema,
      "geoarrow.linestring"
    );
    if (geometryColumnIndex === null) {
      console.warn("No geoarrow.linestring column found.");
      return null;
    }

    const geometryColumn = data.getChildAt(geometryColumnIndex);
    if (!geometryColumn) {
      return null;
    }

    const layers: PathLayer[] = [];
    for (let i = 0; i < geometryColumn.data.length; i++) {
      const arrowData = geometryColumn.data[i];
      assert(arrowData.typeId === arrow.Type.List);

      const geomOffsets = arrowData.valueOffsets;
      assert(arrowData.children.length === 1);
      assert(arrowData.children[0].typeId === arrow.Type.FixedSizeList);

      const flatCoordinateArray =
        arrowData.children[0].children[0].values;

      const layer = new PathLayer({
        // ...this.props,
        id: `${this.props.id}-geoarrow-linestring-${i}`,
        data: {
          length: arrowData.length,
          startIndices: geomOffsets,
          attributes: {
            getPath: { value: flatCoordinateArray, size: 2 },
          },
        },
        _pathType: 'open', // this instructs the layer to skip normalization and use the binary as-is
        widthUnits: 'pixels',
        widthMinPixels: 1,

        getColor: [255, 0, 0],
        // // getLineColor: [0, 0, 255],
        // stroked: false,
        // radiusMinPixels: 1,
        // getPointRadius: 10,
        // pointRadiusMinPixels: 0.8,
      });
      layers.push(layer);
    }

    return layers;
  }
}
