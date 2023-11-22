import {
  CompositeLayer,
  CompositeLayerProps,
  DefaultProps,
  GetPickingInfoParams,
  Layer,
  LayersList,
  assert,
} from "@deck.gl/core/typed";
import { ScatterplotLayer } from "@deck.gl/layers/typed";
import type { ScatterplotLayerProps } from "@deck.gl/layers/typed";
import * as arrow from "apache-arrow";
import * as ga from "@geoarrow/geoarrow-js";
import {
  assignAccessor,
  extractAccessorsFromProps,
  getGeometryVector,
  invertOffsets,
} from "./utils.js";
import { getPickingInfo } from "./picking.js";
import { ColorAccessor, FloatAccessor, GeoArrowPickingInfo } from "./types.js";
import { EXTENSION_NAME } from "./constants.js";
import { validateAccessors } from "./validate.js";

/** All properties supported by GeoArrowScatterplotLayer */
export type GeoArrowScatterplotLayerProps = Omit<
  ScatterplotLayerProps<arrow.Table>,
  "data" | "getPosition" | "getRadius" | "getFillColor" | "getLineColor"
> &
  _GeoArrowScatterplotLayerProps &
  CompositeLayerProps;

/** Properties added by GeoArrowScatterplotLayer */
type _GeoArrowScatterplotLayerProps = {
  data: arrow.Table;

  /**
   * If `true`, validate the arrays provided (e.g. chunk lengths)
   * @default true
   */
  _validate?: boolean;
  /**
   * Center position accessor.
   * If not provided, will be inferred by finding a column with extension type
   * `"geoarrow.point"` or `"geoarrow.multipoint"`.
   */
  getPosition?: ga.vector.PointVector | ga.vector.MultiPointVector;
  /**
   * Radius accessor.
   * @default 1
   */
  getRadius?: FloatAccessor;
  /**
   * Fill color accessor.
   * @default [0, 0, 0, 255]
   */
  getFillColor?: ColorAccessor;
  /**
   * Stroke color accessor.
   * @default [0, 0, 0, 255]
   */
  getLineColor?: ColorAccessor;
  /**
   * Stroke width accessor.
   * @default 1
   */
  getLineWidth?: FloatAccessor;
};

// Remove data and getPosition from the upstream default props
const {
  data: _data,
  getPosition: _getPosition,
  ..._upstreamDefaultProps
} = ScatterplotLayer.defaultProps;

// Default props added by us
const ourDefaultProps = {
  _validate: true,
};

const defaultProps: DefaultProps<GeoArrowScatterplotLayerProps> = {
  ..._upstreamDefaultProps,
  ...ourDefaultProps,
};

export class GeoArrowScatterplotLayer<
  ExtraProps extends {} = {},
> extends CompositeLayer<Required<GeoArrowScatterplotLayerProps> & ExtraProps> {
  static defaultProps = defaultProps;
  static layerName = "GeoArrowScatterplotLayer";

  getPickingInfo(params: GetPickingInfoParams): GeoArrowPickingInfo {
    return getPickingInfo(params, this.props.data);
  }

  renderLayers(): Layer<{}> | LayersList | null {
    const { data: table } = this.props;

    const pointVector = getGeometryVector(table, EXTENSION_NAME.POINT);
    if (pointVector !== null) {
      return this._renderLayersPoint(pointVector);
    }

    const multiPointVector = getGeometryVector(
      table,
      EXTENSION_NAME.MULTIPOINT,
    );
    if (multiPointVector !== null) {
      return this._renderLayersMultiPoint(multiPointVector);
    }

    const geometryColumn = this.props.getPosition;
    if (ga.vector.isPointVector(geometryColumn)) {
      return this._renderLayersPoint(geometryColumn);
    }

    if (ga.vector.isMultiPointVector(geometryColumn)) {
      return this._renderLayersMultiPoint(geometryColumn);
    }

    throw new Error("geometryColumn not point or multipoint");
  }

  _renderLayersPoint(
    geometryColumn: ga.vector.PointVector,
  ): Layer<{}> | LayersList | null {
    const { data: table } = this.props;

    if (this.props._validate) {
      assert(ga.vector.isPointVector(geometryColumn));
      validateAccessors(this.props, table);
    }

    // Exclude manually-set accessors
    const [accessors, otherProps] = extractAccessorsFromProps(this.props, [
      "getPosition",
    ]);

    const layers: ScatterplotLayer[] = [];
    for (
      let recordBatchIdx = 0;
      recordBatchIdx < table.batches.length;
      recordBatchIdx++
    ) {
      const geometryData = geometryColumn.data[recordBatchIdx];
      const flatCoordsData = ga.child.getPointChild(geometryData);
      const flatCoordinateArray = flatCoordsData.values;

      const props: ScatterplotLayerProps = {
        // Note: because this is a composite layer and not doing the rendering
        // itself, we still have to pass in our defaultProps
        ...ourDefaultProps,
        ...otherProps,

        // @ts-expect-error used for picking purposes
        recordBatchIdx,

        id: `${this.props.id}-geoarrow-scatterplot-${recordBatchIdx}`,
        data: {
          length: geometryData.length,
          attributes: {
            getPosition: {
              value: flatCoordinateArray,
              size: geometryData.type.listSize,
            },
          },
        },
      };

      for (const [propName, propInput] of Object.entries(accessors)) {
        assignAccessor({
          props,
          propName,
          propInput,
          chunkIdx: recordBatchIdx,
        });
      }

      const layer = new ScatterplotLayer(this.getSubLayerProps(props));
      layers.push(layer);
    }

    return layers;
  }

  _renderLayersMultiPoint(
    geometryColumn: ga.vector.MultiPointVector,
  ): Layer<{}> | LayersList | null {
    const { data: table } = this.props;

    // TODO: validate that if nested, accessor props have the same nesting
    // structure as the main geometry column.
    if (this.props._validate) {
      assert(ga.vector.isMultiPointVector(geometryColumn));
      validateAccessors(this.props, table);
    }

    // Exclude manually-set accessors
    const [accessors, otherProps] = extractAccessorsFromProps(this.props, [
      "getPosition",
    ]);

    const layers: ScatterplotLayer[] = [];
    for (
      let recordBatchIdx = 0;
      recordBatchIdx < table.batches.length;
      recordBatchIdx++
    ) {
      const multiPointData = geometryColumn.data[recordBatchIdx];
      const pointData = ga.child.getMultiPointChild(multiPointData);
      const geomOffsets = multiPointData.valueOffsets;
      const flatCoordsData = ga.child.getPointChild(pointData);
      const flatCoordinateArray = flatCoordsData.values;

      const props: ScatterplotLayerProps = {
        // Note: because this is a composite layer and not doing the rendering
        // itself, we still have to pass in our defaultProps
        ...ourDefaultProps,
        ...otherProps,

        // @ts-expect-error used for picking purposes
        recordBatchIdx,
        invertedGeomOffsets: invertOffsets(geomOffsets),

        id: `${this.props.id}-geoarrow-scatterplot-${recordBatchIdx}`,
        data: {
          // Note: this needs to be the length one level down.
          length: pointData.length,
          attributes: {
            getPosition: {
              value: flatCoordinateArray,
              size: pointData.type.listSize,
            },
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

      const layer = new ScatterplotLayer(this.getSubLayerProps(props));
      layers.push(layer);
    }

    return layers;
  }
}
