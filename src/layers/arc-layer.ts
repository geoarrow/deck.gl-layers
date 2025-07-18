// deck.gl-community
// SPDX-License-Identifier: MIT
// Copyright (c) vis.gl contributors

import {
  CompositeLayer,
  CompositeLayerProps,
  DefaultProps,
  GetPickingInfoParams,
  Layer,
  LayersList,
  assert,
} from "@deck.gl/core";
import { ArcLayer } from "@deck.gl/layers";
import type { ArcLayerProps } from "@deck.gl/layers";
import * as arrow from "apache-arrow";
import * as ga from "@geoarrow/geoarrow-js";
import {
  assignAccessor,
  convertStructToFixedSizeList,
  extractAccessorsFromProps,
  isGeomSeparate,
} from "../utils/utils";
import { child } from "@geoarrow/geoarrow-js";
import {
  GeoArrowExtraPickingProps,
  computeChunkOffsets,
  getPickingInfo,
} from "../utils/picking";
import { ColorAccessor, FloatAccessor, GeoArrowPickingInfo } from "../types";
import { validateAccessors } from "../utils/validate";

/** All properties supported by GeoArrowArcLayer */
export type GeoArrowArcLayerProps = Omit<
  ArcLayerProps,
  | "data"
  | "getSourcePosition"
  | "getTargetPosition"
  | "getSourceColor"
  | "getTargetColor"
  | "getWidth"
  | "getHeight"
  | "getTilt"
> &
  _GeoArrowArcLayerProps &
  CompositeLayerProps;

/** Properties added by GeoArrowArcLayer */
type _GeoArrowArcLayerProps = {
  data: arrow.Table;

  /**
   * Method called to retrieve the source position of each object.
   */
  getSourcePosition: ga.vector.PointVector;

  /**
   * Method called to retrieve the target position of each object.
   */
  getTargetPosition: ga.vector.PointVector;

  /**
   * The rgba color is in the format of `[r, g, b, [a]]`.
   * @default [0, 0, 0, 255]
   */
  getSourceColor?: ColorAccessor;

  /**
   * The rgba color is in the format of `[r, g, b, [a]]`.
   * @default [0, 0, 0, 255]
   */
  getTargetColor?: ColorAccessor;

  /**
   * The line width of each object, in units specified by `widthUnits`.
   * @default 1
   */
  getWidth?: FloatAccessor;

  /**
   * Multiplier of layer height. `0` will make the layer flat.
   * @default 1
   */
  getHeight?: FloatAccessor;

  /**
   * Use to tilt the arc to the side if you have multiple arcs with the same source and target positions.
   * @default 0
   */
  getTilt?: FloatAccessor;

  /**
   * If `true`, validate the arrays provided (e.g. chunk lengths)
   * @default true
   */
  _validate?: boolean;
};

// Remove data from the upstream default props
const {
  data: _data,
  getSourcePosition: _getSourcePosition,
  getTargetPosition: _getTargetPosition,
  ..._defaultProps
} = ArcLayer.defaultProps;

// Default props added by us
const ourDefaultProps = {
  _validate: true,
};

// @ts-expect-error Type error in merging default props with ours
const defaultProps: DefaultProps<GeoArrowArcLayerProps> = {
  ..._defaultProps,
  ...ourDefaultProps,
};

export class GeoArrowArcLayer<
  ExtraProps extends {} = {},
> extends CompositeLayer<GeoArrowArcLayerProps & ExtraProps> {
  static defaultProps = defaultProps;
  static layerName = "GeoArrowArcLayer";

  getPickingInfo(
    params: GetPickingInfoParams & {
      sourceLayer: { props: GeoArrowExtraPickingProps };
    },
  ): GeoArrowPickingInfo {
    return getPickingInfo(params, this.props.data);
  }

  renderLayers(): Layer<{}> | LayersList | null {
    return this._renderLayersPoint();
  }

  _renderLayersPoint(): Layer<{}> | LayersList | null {
    const {
      data: table,
      getSourcePosition: sourcePosition,
      getTargetPosition: targetPosition,
    } = this.props;

    if (this.props._validate) {
      validateAccessors(this.props, table);

      // Note: below we iterate over table batches anyways, so this layer won't
      // work as-is if data/table is null
      assert(ga.vector.isPointVector(sourcePosition));
      assert(ga.vector.isPointVector(targetPosition));
    }

    // Exclude manually-set accessors
    const [accessors, otherProps] = extractAccessorsFromProps(this.props, [
      "getSourcePosition",
      "getTargetPosition",
    ]);
    const tableOffsets = computeChunkOffsets(table.data);

    const layers: ArcLayer[] = [];
    for (
      let recordBatchIdx = 0;
      recordBatchIdx < table.batches.length;
      recordBatchIdx++
    ) {
      let sourceData = sourcePosition.data[recordBatchIdx];
      if (isGeomSeparate(sourceData)) {
        sourceData = convertStructToFixedSizeList(sourceData);
      }
      const sourceValues = child.getPointChild(sourceData).values;
      let targetData = targetPosition.data[recordBatchIdx];
      if (isGeomSeparate(targetData)) {
        targetData = convertStructToFixedSizeList(targetData);
      }
      const targetValues = child.getPointChild(targetData).values;

      const props: ArcLayerProps = {
        // Note: because this is a composite layer and not doing the rendering
        // itself, we still have to pass in our defaultProps
        ...ourDefaultProps,
        ...otherProps,

        // used for picking purposes
        recordBatchIdx,
        tableOffsets,

        id: `${this.props.id}-geoarrow-arc-${recordBatchIdx}`,
        data: {
          // @ts-expect-error passed through to enable use by function accessors
          data: table.batches[recordBatchIdx],
          length: sourceData.length,
          attributes: {
            getSourcePosition: {
              value: sourceValues,
              size: sourceData.type.listSize,
            },
            getTargetPosition: {
              value: targetValues,
              size: targetData.type.listSize,
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

      const layer = new ArcLayer(this.getSubLayerProps(props));
      layers.push(layer);
    }

    return layers;
  }
}
