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
import { TextLayer } from "@deck.gl/layers";
import type { TextLayerProps } from "@deck.gl/layers";
import * as arrow from "apache-arrow";
import * as ga from "@geoarrow/geoarrow-js";
import {
  assignAccessor,
  convertStructToFixedSizeList,
  expandArrayToCoords,
  extractAccessorsFromProps,
  getGeometryData,
  isGeomSeparate,
} from "../utils/utils";
import { GeoArrowExtraPickingProps, getPickingInfo } from "../utils/picking";
import { ColorAccessor, FloatAccessor, GeoArrowPickingInfo } from "../types";
import { EXTENSION_NAME } from "../constants";
import { validateAccessors } from "../utils/validate";

/** All properties supported by GeoArrowTextLayer */
export type GeoArrowTextLayerProps = Omit<
  TextLayerProps<arrow.RecordBatch>,
  // We remove background for now because there are special requirements for
  // using binary attributes with background
  // https://deck.gl/docs/api-reference/layers/text-layer#use-binary-attributes-with-background
  | "background"
  | "data"
  | "getBackgroundColor"
  | "getBorderColor"
  | "getBorderWidth"
  | "getText"
  | "getPosition"
  | "getColor"
  | "getSize"
  | "getAngle"
  | "getTextAnchor"
  | "getAlignmentBaseline"
  | "getPixelOffset"
> &
  _GeoArrowTextLayerProps &
  CompositeLayerProps;

/** Properties added by GeoArrowTextLayer */
type _GeoArrowTextLayerProps = {
  data: arrow.RecordBatch;

  /** Background color accessor.
   * @default [255, 255, 255, 255]
   */
  getBackgroundColor?: ColorAccessor;
  /** Border color accessor.
   * @default [0, 0, 0, 255]
   */
  getBorderColor?: ColorAccessor;
  /** Border width accessor.
   * @default 0
   */
  getBorderWidth?: FloatAccessor;
  /**
   * Label text accessor
   */
  getText: arrow.Data<arrow.Utf8>;
  /**
   * Anchor position accessor
   */
  getPosition?: ga.data.PointData;
  /**
   * Label color accessor
   * @default [0, 0, 0, 255]
   */
  getColor?: ColorAccessor;
  /**
   * Label size accessor
   * @default 32
   */
  getSize?: FloatAccessor;
  /**
   * Label rotation accessor, in degrees
   * @default 0
   */
  getAngle?: FloatAccessor;
  /**
   * Horizontal alignment accessor
   * @default 'middle'
   */
  getTextAnchor?: arrow.Data<arrow.Utf8> | "start" | "middle" | "end";
  /**
   * Vertical alignment accessor
   * @default 'center'
   */
  getAlignmentBaseline?: arrow.Data<arrow.Utf8> | "top" | "center" | "bottom";
  /**
   * Label offset from the anchor position, [x, y] in pixels
   * @default [0, 0]
   */
  getPixelOffset?:
    | arrow.Data<arrow.FixedSizeList<arrow.Int>>
    | [number, number];

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
  getText: _getText,
  getTextAnchor: _getTextAnchor,
  getAlignmentBaseline: _getAlignmentBaseline,
  getPixelOffset: _getPixelOffset,
  ..._defaultProps
} = TextLayer.defaultProps;

// Default props added by us
const ourDefaultProps: Pick<
  GeoArrowTextLayerProps,
  "getTextAnchor" | "getAlignmentBaseline" | "getPixelOffset" | "_validate"
> = {
  getTextAnchor: "middle",
  getAlignmentBaseline: "center",
  getPixelOffset: [0, 0],
  _validate: true,
};

// @ts-expect-error Type error in merging default props with ours
const defaultProps: DefaultProps<GeoArrowTextLayerProps> = {
  ..._defaultProps,
  ...ourDefaultProps,
};

export class GeoArrowTextLayer<
  ExtraProps extends {} = {},
> extends CompositeLayer<GeoArrowTextLayerProps & ExtraProps> {
  static defaultProps = defaultProps;
  static layerName = "GeoArrowTextLayer";

  getPickingInfo(
    params: GetPickingInfoParams & {
      sourceLayer: { props: GeoArrowExtraPickingProps };
    },
  ): GeoArrowPickingInfo {
    return getPickingInfo(params, this.props.data);
  }

  renderLayers(): Layer<{}> | LayersList | null {
    const { data: batch } = this.props;

    if (this.props.getPosition !== undefined) {
      const geometryData = this.props.getPosition;
      if (geometryData !== undefined && ga.data.isPointData(geometryData)) {
        return this._renderTextLayer(geometryData, this.props.getText);
      }

      throw new Error(
        "getPosition should pass in an arrow Vector of Point type",
      );
    } else {
      const pointData = getGeometryData(batch, EXTENSION_NAME.POINT);
      if (pointData !== null && ga.data.isPointData(pointData)) {
        return this._renderTextLayer(pointData, this.props.getText);
      }
    }

    throw new Error("getPosition not GeoArrow point");
  }

  _renderTextLayer(
    geometryData: ga.data.PointData,
    textData: arrow.Data<arrow.Utf8>,
  ): Layer<{}> | LayersList | null {
    const { data: table } = this.props;

    if (this.props._validate) {
      assert(ga.data.isPointData(geometryData));
      validateAccessors(this.props, table);
    }

    // Exclude manually-set accessors
    const [accessors, otherProps] = extractAccessorsFromProps(this.props, [
      "getPosition",
      "getText",
    ]);

    if (isGeomSeparate(geometryData)) {
      geometryData = convertStructToFixedSizeList(geometryData);
    }
    const flatCoordsData = ga.child.getPointChild(geometryData);
    const flatCoordinateArray = flatCoordsData.values;

    // console.log(textData);
    const textValues = textData.values;
    const characterOffsets = textData.valueOffsets;

    const props: TextLayerProps = {
      // Note: because this is a composite layer and not doing the rendering
      // itself, we still have to pass in our defaultProps
      ...ourDefaultProps,
      ...otherProps,

      id: `${this.props.id}-geoarrow-heatmap`,
      data: {
        // @ts-expect-error passed through to enable use by function accessors
        data: table.batches[recordBatchIdx],
        length: geometryData.length,
        startIndices: characterOffsets,
        attributes: {
          // Positions need to be expanded to be one per character!
          getPosition: {
            value: expandArrayToCoords(
              flatCoordinateArray,
              geometryData.type.listSize,
              characterOffsets,
            ),
            size: geometryData.type.listSize,
          },
          // TODO: support non-ascii characters
          getText: {
            value: textValues,
            // size: 1,
          },
        },
      },
    };

    for (const [propName, propInput] of Object.entries(accessors)) {
      assignAccessor({
        props,
        propName,
        propInput,
        geomCoordOffsets: characterOffsets,
      });
    }

    return new TextLayer(this.getSubLayerProps(props));
  }
}
