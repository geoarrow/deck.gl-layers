import {
  CompositeLayer,
  CompositeLayerProps,
  DefaultProps,
  GetPickingInfoParams,
  Layer,
  LayersList,
  assert,
} from "@deck.gl/core";
import { ColumnLayer } from "@deck.gl/layers";
import type { ColumnLayerProps } from "@deck.gl/layers";
import * as arrow from "apache-arrow";
import {
  assignAccessor,
  extractAccessorsFromProps,
  getGeometryVector,
} from "./utils.js";
import * as ga from "@geoarrow/geoarrow-js";
import { ColorAccessor, FloatAccessor, GeoArrowPickingInfo } from "./types.js";
import { EXTENSION_NAME } from "./constants.js";
import {
  GeoArrowExtraPickingProps,
  computeChunkOffsets,
  getPickingInfo,
} from "./picking.js";
import { validateAccessors } from "./validate.js";

/** All properties supported by GeoArrowColumnLayer */
export type GeoArrowColumnLayerProps = Omit<
  ColumnLayerProps<arrow.Table>,
  | "data"
  | "getPosition"
  | "getFillColor"
  | "getLineColor"
  | "getElevation"
  | "getLineWidth"
> &
  _GeoArrowColumnLayerProps &
  CompositeLayerProps;

/** Properties added by GeoArrowColumnLayer */
type _GeoArrowColumnLayerProps = {
  data: arrow.Table;

  /**
   * Method called to retrieve the position of each column.
   */
  getPosition?: ga.vector.PointVector;

  /**
   * Fill color value or accessor.
   * @default [0, 0, 0, 255]
   */
  getFillColor?: ColorAccessor;

  /**
   * Line color value or accessor.
   *
   * @default [0, 0, 0, 255]
   */
  getLineColor?: ColorAccessor;

  /**
   * The elevation of each cell in meters.
   * @default 1000
   */
  getElevation?: FloatAccessor;

  /**
   * The width of the outline of the column, in units specified by `lineWidthUnits`.
   *
   * @default 1
   */
  getLineWidth?: FloatAccessor;

  /**
   * If `true`, validate the arrays provided (e.g. chunk lengths)
   * @default true
   */
  _validate?: boolean;
};

// Remove data and getPosition from the upstream default props
const {
  data: _data,
  getPosition: _getPosition,
  ..._defaultProps
} = ColumnLayer.defaultProps;

// Default props added by us
const ourDefaultProps = {
  _validate: true,
};

// @ts-expect-error Type error in merging default props with ours
const defaultProps: DefaultProps<GeoArrowColumnLayerProps> = {
  ..._defaultProps,
  ...ourDefaultProps,
};

/**
 * Render extruded cylinders (tessellated regular polygons) at given
 * coordinates.
 */
export class GeoArrowColumnLayer<
  ExtraProps extends {} = {},
> extends CompositeLayer<GeoArrowColumnLayerProps & ExtraProps> {
  static defaultProps = defaultProps;
  static layerName = "GeoArrowColumnLayer";

  getPickingInfo(
    params: GetPickingInfoParams & {
      sourceLayer: { props: GeoArrowExtraPickingProps };
    },
  ): GeoArrowPickingInfo {
    return getPickingInfo(params, this.props.data);
  }

  renderLayers(): Layer<{}> | LayersList | null {
    const { data: table } = this.props;

    const pointVector = getGeometryVector(table, EXTENSION_NAME.POINT);
    if (pointVector !== null) {
      return this._renderLayersPoint(pointVector);
    }

    const geometryColumn = this.props.getPosition;
    if (
      geometryColumn !== undefined &&
      ga.vector.isPointVector(geometryColumn)
    ) {
      return this._renderLayersPoint(geometryColumn);
    }

    throw new Error("getPosition not GeoArrow point");
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
    const tableOffsets = computeChunkOffsets(table.data);

    const layers: ColumnLayer[] = [];
    for (
      let recordBatchIdx = 0;
      recordBatchIdx < table.batches.length;
      recordBatchIdx++
    ) {
      const geometryData = geometryColumn.data[recordBatchIdx];
      const flatCoordsData = ga.child.getPointChild(geometryData);
      const flatCoordinateArray = flatCoordsData.values;

      const props: ColumnLayerProps = {
        // Note: because this is a composite layer and not doing the rendering
        // itself, we still have to pass in our defaultProps
        ...ourDefaultProps,
        ...otherProps,

        // used for picking purposes
        recordBatchIdx,
        tableOffsets,

        id: `${this.props.id}-geoarrow-column-${recordBatchIdx}`,
        data: {
          // @ts-expect-error passed through to enable use by function accessors
          data: table.batches[recordBatchIdx],
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

      const layer = new ColumnLayer(this.getSubLayerProps(props));
      layers.push(layer);
    }

    return layers;
  }
}
