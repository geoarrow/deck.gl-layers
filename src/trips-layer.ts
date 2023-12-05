import {
  CompositeLayer,
  CompositeLayerProps,
  DefaultProps,
  Layer,
  LayersList,
  assert,
} from "@deck.gl/core/typed";
import { TripsLayer } from "@deck.gl/geo-layers/typed";
import * as ga from "@geoarrow/geoarrow-js";
import {
  assignAccessor,
  extractAccessorsFromProps,
  getGeometryVector,
} from "./utils.js";
import { TimestampAccessor } from "./types.js";
import {
  GeoArrowPathLayerProps,
  defaultProps as pathLayerDefaultProps,
} from "./path-layer.js";
import { validateAccessors } from "./validate.js";
import { EXTENSION_NAME } from "./constants.js";
import { TripsLayerProps } from "@deck.gl/geo-layers/typed/trips-layer/trips-layer.js";

/** All properties supported by GeoArrowTripsLayer */
export type GeoArrowTripsLayerProps = _GeoArrowTripsLayerProps &
  Omit<GeoArrowPathLayerProps, "getPath"> &
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
  getTimestamps: TimestampAccessor;
  /**
   * If `true`, validate the arrays provided (e.g. chunk lengths)
   * @default true
   */
  _validate?: boolean;
  /**
   * Path geometry accessor.
   */
  getPath?: ga.vector.LineStringVector;
};

// Remove data and getPosition from the upstream default props
const {
  data: _data,
  getPath: _getPath,
  ..._defaultProps
} = pathLayerDefaultProps;

const defaultProps: DefaultProps<GeoArrowTripsLayerProps> = {
  ..._defaultProps,
  fadeTrail: true,
  trailLength: { type: "number", value: 120, min: 0 },
  currentTime: { type: "number", value: 0, min: 0 },
  _validate: true,
};

/** Render animated paths that represent vehicle trips. */
export class GeoArrowTripsLayer<
  ExtraProps extends {} = {},
> extends CompositeLayer<Required<GeoArrowTripsLayerProps> & ExtraProps> {
  static defaultProps = defaultProps;
  static layerName = "GeoArrowTripsLayer";

  renderLayers(): Layer<{}> | LayersList | null {
    const { data: table } = this.props;

    const lineStringVector = getGeometryVector(
      table,
      EXTENSION_NAME.LINESTRING,
    );
    if (lineStringVector !== null) {
      return this._renderLayersLineString(lineStringVector);
    }

    const geometryColumn = this.props.getPath;
    if (ga.vector.isLineStringVector(geometryColumn)) {
      return this._renderLayersLineString(geometryColumn);
    }

    throw new Error("geometryColumn not LineString");
  }

  _renderLayersLineString(
    geometryColumn: ga.vector.LineStringVector,
  ): Layer<{}> | LayersList | null {
    const { data: table } = this.props;

    if (this.props._validate) {
      assert(ga.vector.isLineStringVector(geometryColumn));
      validateAccessors(this.props, table);
    }

    // Exclude manually-set accessors
    const [accessors, otherProps] = extractAccessorsFromProps(this.props, [
      "getPath",
    ]);

    const layers: TripsLayer[] = [];
    for (
      let recordBatchIdx = 0;
      recordBatchIdx < table.batches.length;
      recordBatchIdx++
    ) {
      const lineStringData = geometryColumn.data[recordBatchIdx];
      const geomOffsets = lineStringData.valueOffsets;
      const pointData = ga.child.getLineStringChild(lineStringData);
      const nDim = pointData.type.listSize;
      const coordData = ga.child.getPointChild(pointData);
      const flatCoordinateArray = coordData.values;

      const props: TripsLayerProps = {
        // Note: because this is a composite layer and not doing the rendering
        // itself, we still have to pass in our defaultProps
        ...ourDefaultProps,
        ...otherProps,

        // used for picking purposes
        recordBatchIdx,

        id: `${this.props.id}-geoarrow-trip-${recordBatchIdx}`,
        data: {
          length: lineStringData.length,
          // @ts-ignore
          startIndices: geomOffsets,
          attributes: {
            getPath: { value: flatCoordinateArray, size: nDim },
          },
        },
      };

      for (const [propName, propInput] of Object.entries(accessors)) {
        assignAccessor({
          props,
          propName,
          propInput,
          chunkIdx: recordBatchIdx,
          geomCoordOffsets: geomOffsets,
        });
      }

      const layer = new TripsLayer(props);
      layers.push(layer);
    }

    return layers;
  }
}
