import {
  Accessor,
  Color,
  CompositeLayer,
  CompositeLayerProps,
  DefaultProps,
  Layer,
  LayersList,
  Unit,
} from "@deck.gl/core/typed";
import { TripsLayer } from "@deck.gl/geo-layers/typed";
import type { PathLayerProps } from "@deck.gl/layers/typed";
import * as arrow from "apache-arrow";
import {
  assignAccessor,
  getGeometryVector,
  validateColorVector,
  validateLineStringType,
  validateVectorAccessors,
} from "./utils.js";
import { LineStringVector } from "./types.js";
import { GeoArrowPathLayerProps } from "./path-layer.js";

const DEFAULT_COLOR: [number, number, number, number] = [0, 0, 0, 255];

/** All properties supported by GeoArrowTripsLayer */
export type GeoArrowTripsLayerProps = _GeoArrowTripsLayerProps &
  GeoArrowPathLayerProps &
  CompositeLayerProps;

/** Properties added by GeoArrowTripsLayer */
type _GeoArrowTripsLayerProps = {
  /**
   * Whether or not the path fades out.
   * @default true
   */
  fadeTrail?: boolean;
  /**
   * Trail length.
   * @default 120
   */
  trailLength?: number;
  /**
   * The current time of the frame.
   * @default 0
   */
  currentTime?: number;
  /**
   * Timestamp accessor.
   */
  getTimestamps: arrow.Vector<arrow.List<arrow.Timestamp>>;
};

const defaultProps: DefaultProps<GeoArrowTripsLayerProps> = {
  widthUnits: "meters",
  widthScale: { type: "number", min: 0, value: 1 },
  widthMinPixels: { type: "number", min: 0, value: 0 },
  widthMaxPixels: { type: "number", min: 0, value: Number.MAX_SAFE_INTEGER },
  jointRounded: false,
  capRounded: false,
  miterLimit: { type: "number", min: 0, value: 4 },
  billboard: false,
  // Note: this diverges from upstream, where here we _default into_ binary
  // rendering
  // This instructs the layer to skip normalization and use the binary
  // as-is
  _pathType: "open",
  _validate: true,

  getColor: { type: "accessor", value: DEFAULT_COLOR },
  getWidth: { type: "accessor", value: 1 },

  fadeTrail: true,
  trailLength: { type: "number", value: 120, min: 0 },
  currentTime: { type: "number", value: 0, min: 0 },
  // No default, making it required
  // getTimestamps: { type: "accessor", value: (d) => d.timestamps },
};

/** Render animated paths that represent vehicle trips. */
export class GeoArrowTripsLayer<
  ExtraProps extends {} = {}
> extends CompositeLayer<Required<GeoArrowTripsLayerProps> & ExtraProps> {
  static defaultProps = defaultProps;
  static layerName = "GeoArrowTripsLayer";

  renderLayers(): Layer<{}> | LayersList | null {
    const { data: table } = this.props;

    const geometryColumn: LineStringVector =
      this.props.getPath || getGeometryVector(table, "geoarrow.linestring");

    if (this.props._validate) {
      const vectorAccessors: arrow.Vector[] = [geometryColumn];
      for (const accessor of [this.props.getColor, this.props.getWidth]) {
        if (accessor instanceof arrow.Vector) {
          vectorAccessors.push(accessor);
        }
      }

      validateLineStringType(geometryColumn.type);
      validateVectorAccessors(table, vectorAccessors);

      if (this.props.getColor instanceof arrow.Vector) {
        validateColorVector(this.props.getColor);
      }
    }

    const layers: TripsLayer[] = [];
    for (
      let recordBatchIdx = 0;
      recordBatchIdx < table.batches.length;
      recordBatchIdx++
    ) {
      const geometryData = geometryColumn.data[recordBatchIdx];
      const geomOffsets = geometryData.valueOffsets;
      const nDim = geometryData.type.children[0].type.listSize;
      const flatCoordinateArray = geometryData.children[0].children[0].values;

      const props = {
        id: `${this.props.id}-geoarrow-linestring-${recordBatchIdx}`,
        widthUnits: this.props.widthUnits,
        widthScale: this.props.widthScale,
        widthMinPixels: this.props.widthMinPixels,
        widthMaxPixels: this.props.widthMaxPixels,
        jointRounded: this.props.jointRounded,
        capRounded: this.props.capRounded,
        miterLimit: this.props.miterLimit,
        billboard: this.props.billboard,
        _pathType: this.props._pathType,
        data: {
          length: geometryData.length,
          // @ts-ignore
          startIndices: geomOffsets,
          attributes: {
            getPath: { value: flatCoordinateArray, size: nDim },
          },
        },
      };

      assignAccessor({
        props,
        propName: "getColor",
        propInput: this.props.getColor,
        chunkIdx: recordBatchIdx,
        geomCoordOffsets: geomOffsets,
      });
      assignAccessor({
        props,
        propName: "getWidth",
        propInput: this.props.getWidth,
        chunkIdx: recordBatchIdx,
        geomCoordOffsets: geomOffsets,
      });

      const layer = new TripsLayer(props);
      layers.push(layer);
    }

    return layers;
  }
}
