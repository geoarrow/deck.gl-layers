import {
  CompositeLayer,
  CompositeLayerProps,
  DefaultProps,
  Layer,
  LayersList,
  assert,
} from "@deck.gl/core";
import { TripsLayer, TripsLayerProps } from "@deck.gl/geo-layers";
import * as arrow from "apache-arrow";
import * as ga from "@geoarrow/geoarrow-js";
import {
  assignAccessor,
  extractAccessorsFromProps,
  getGeometryVector,
} from "./utils.js";
import { TimestampAccessor, ColorAccessor, FloatAccessor } from "./types.js";
import {
  GeoArrowPathLayerProps,
  defaultProps as pathLayerDefaultProps,
} from "./path-layer.js";
import { validateAccessors } from "./validate.js";
import { EXTENSION_NAME } from "./constants.js";
import { computeChunkOffsets } from "./picking.js";

/** All properties supported by GeoArrowTripsLayer */
export type GeoArrowTripsLayerProps = Omit<
  TripsLayerProps<arrow.Table>,
  "data" | "getPath" | "getColor" | "getWidth" | "getTimestamps"
> &
  _GeoArrowTripsLayerProps &
  CompositeLayerProps;

/** Properties added by GeoArrowTripsLayer */
type _GeoArrowTripsLayerProps = {
  data: arrow.Table;

  /**
   * If `true`, validate the arrays provided (e.g. chunk lengths)
   * @default true
   */
  _validate?: boolean;
  /**
   * Path geometry accessor.
   */
  getPath?: ga.vector.LineStringVector;
  /**
   * Path color accessor.
   * @default [0, 0, 0, 255]
   */
  getColor?: ColorAccessor;
  /**
   * Path width accessor.
   * @default 1
   */
  getWidth?: FloatAccessor;
  /**
   * Timestamp accessor.
   */
  getTimestamps: TimestampAccessor;
};

// Remove data and getPosition from the upstream default props
const {
  data: _data,
  getPath: _getPath,
  ..._defaultProps
} = pathLayerDefaultProps;

// Default props added by us
const ourDefaultProps: Pick<
  GeoArrowTripsLayerProps,
  "_pathType" | "_validate"
> = {
  // Note: this diverges from upstream, where here we _default into_ binary
  // rendering
  // This instructs the layer to skip normalization and use the binary
  // as-is
  _pathType: "open",
  _validate: true,
};

const defaultProps: DefaultProps<GeoArrowTripsLayerProps> = {
  ..._defaultProps,
  ...ourDefaultProps,
};

/** Render animated paths that represent vehicle trips. */
export class GeoArrowTripsLayer<
  ExtraProps extends {} = {},
> extends CompositeLayer<GeoArrowTripsLayerProps & ExtraProps> {
  static defaultProps = defaultProps;
  static layerName = "GeoArrowTripsLayer";

  renderLayers(): Layer<{}> | LayersList | null {
    const { data: table } = this.props;

    if (this.props.getPath !== undefined) {
      const geometryColumn = this.props.getPath;
      if (
        geometryColumn !== undefined &&
        ga.vector.isLineStringVector(geometryColumn)
      ) {
        return this._renderLayersLineString(geometryColumn);
      }

      throw new Error("getPath should be an arrow Vector of LineString type");
    } else {
      const lineStringVector = getGeometryVector(
        table,
        EXTENSION_NAME.LINESTRING,
      );
      if (lineStringVector !== null) {
        return this._renderLayersLineString(lineStringVector);
      }
    }

    throw new Error("getPath not GeoArrow LineString");
  }

  _renderLayersLineString(
    geometryColumn: ga.vector.LineStringVector,
  ): Layer<{}> | LayersList | null {
    const { data: table } = this.props;

    const timestampColumn = this.props.getTimestamps;
    if (this.props._validate) {
      assert(ga.vector.isLineStringVector(geometryColumn));
      validateAccessors(this.props, table);
    }

    // Exclude manually-set accessors
    const [accessors, otherProps] = extractAccessorsFromProps(this.props, [
      "getPath",
      "getTimestamps",
    ]);
    const tableOffsets = computeChunkOffsets(table.data);

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
      const timestampData = timestampColumn.data[recordBatchIdx];
      const timestampValues = timestampData.children[0].values;

      const props: TripsLayerProps = {
        // Note: because this is a composite layer and not doing the rendering
        // itself, we still have to pass in our defaultProps
        ...ourDefaultProps,
        ...otherProps,

        // used for picking purposes
        recordBatchIdx,
        tableOffsets,

        id: `${this.props.id}-geoarrow-trip-${recordBatchIdx}`,
        data: {
          // @ts-expect-error passed through to enable use by function accessors
          data: table.batches[recordBatchIdx],
          length: lineStringData.length,
          // @ts-ignore
          startIndices: geomOffsets,
          attributes: {
            getPath: { value: flatCoordinateArray, size: nDim },
            getTimestamps: { value: timestampValues, size: 1 },
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
