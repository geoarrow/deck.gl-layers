import {
  CompositeLayer,
  CompositeLayerProps,
  DefaultProps,
  Layer,
  LayersList,
  GetPickingInfoParams,
  assert,
} from "@deck.gl/core/typed";
import { PolygonLayer } from "@deck.gl/layers/typed";
import type { PolygonLayerProps } from "@deck.gl/layers/typed";
import * as arrow from "apache-arrow";
import * as ga from "@geoarrow/geoarrow-js";
import {
  assignAccessor,
  extractAccessorsFromProps,
  getGeometryVector,
  getMultiPolygonResolvedOffsets,
  getPolygonResolvedOffsets,
  invertOffsets,
} from "./utils.js";
import { GeoArrowExtraPickingProps, getPickingInfo } from "./picking.js";
import { ColorAccessor, FloatAccessor, GeoArrowPickingInfo } from "./types.js";
import { EXTENSION_NAME } from "./constants.js";
import { validateAccessors } from "./validate.js";
import { GeoArrowSolidPolygonLayer } from "./solid-polygon-layer.js";
import { GeoArrowPathLayer } from "./path-layer.js";
import { exteriorPolygon } from "./alg/exterior.js";

/** All properties supported by GeoArrowPolygonLayer */
export type GeoArrowPolygonLayerProps = Omit<
  PolygonLayerProps,
  | "data"
  | "getPolygon"
  | "getFillColor"
  | "getLineColor"
  | "getLineWidth"
  | "getElevation"
> &
  _GeoArrowPolygonLayerProps &
  CompositeLayerProps;

/** Properties added by GeoArrowPolygonLayer */
type _GeoArrowPolygonLayerProps = {
  data: arrow.Table;

  /** Polygon geometry accessor. */
  getPolygon?: ga.vector.PolygonVector | ga.vector.MultiPolygonVector;
  /** Fill color accessor.
   * @default [0, 0, 0, 255]
   */
  getFillColor?: ColorAccessor;
  /** Stroke color accessor.
   * @default [0, 0, 0, 255]
   */
  getLineColor?: ColorAccessor;
  /**
   * Line width value or accessor.
   * @default 1
   */
  getLineWidth?: FloatAccessor;
  /**
   * Elevation valur or accessor.
   *
   * Only used if `extruded: true`.
   *
   * @default 1000
   */
  getElevation?: FloatAccessor;

  /**
   * If `true`, validate the arrays provided (e.g. chunk lengths)
   * @default true
   */
  _validate?: boolean;
};

// Remove data and getPolygon from the upstream default props
const {
  data: _data,
  getPolygon: _getPolygon,
  ..._defaultProps
} = PolygonLayer.defaultProps;

// Default props added by us
const ourDefaultProps: Pick<
  GeoArrowPolygonLayerProps,
  "_normalize" | "_windingOrder" | "_validate"
> = {
  // Note: this diverges from upstream, where here we default to no
  // normalization
  _normalize: false,
  // Note: this diverges from upstream, where here we default to CCW
  _windingOrder: "CCW",

  _validate: true,
};

// @ts-expect-error Type error in merging default props with ours
const defaultProps: DefaultProps<GeoArrowPolygonLayerProps> = {
  ..._defaultProps,
  ...ourDefaultProps,
};

const defaultLineColor: [number, number, number, number] = [0, 0, 0, 255];
const defaultFillColor: [number, number, number, number] = [0, 0, 0, 255];

export class GeoArrowPolygonLayer<
  ExtraProps extends {} = {},
> extends CompositeLayer<Required<GeoArrowPolygonLayerProps> & ExtraProps> {
  static defaultProps = defaultProps;
  static layerName = "GeoArrowPolygonLayer";

  getPickingInfo(
    params: GetPickingInfoParams & {
      sourceLayer: { props: GeoArrowExtraPickingProps };
    },
  ): GeoArrowPickingInfo {
    return getPickingInfo(params, this.props.data);
  }

  renderLayers(): Layer<{}> | LayersList | null {
    const { data: table } = this.props;

    const polygonVector = getGeometryVector(table, EXTENSION_NAME.POLYGON);
    if (polygonVector !== null) {
      return this._renderLayersPolygon(polygonVector);
    }

    const MultiPolygonVector = getGeometryVector(
      table,
      EXTENSION_NAME.MULTIPOLYGON,
    );
    if (MultiPolygonVector !== null) {
      return this._renderLayersMultiPolygon(MultiPolygonVector);
    }

    const geometryColumn = this.props.getPolygon;
    if (ga.vector.isPolygonVector(geometryColumn)) {
      return this._renderLayersPolygon(geometryColumn);
    }

    if (ga.vector.isMultiPolygonVector(geometryColumn)) {
      return this._renderLayersMultiPolygon(geometryColumn);
    }

    throw new Error("geometryColumn not Polygon or MultiPolygon");
  }

  _renderLayersPolygon(
    geometryColumn: ga.vector.PolygonVector,
  ): Layer<{}> | LayersList | null {
    const { data: table } = this.props;

    if (this.props._validate) {
      assert(ga.vector.isPolygonVector(geometryColumn));
      validateAccessors(this.props, table);
    }

    const getPath = exteriorPolygon(geometryColumn);

    // Layer composition props
    const {
      data,
      _dataDiff,
      stroked,
      filled,
      extruded,
      wireframe,
      _normalize,
      _windingOrder,
      elevationScale,
      transitions,
      positionFormat,
    } = this.props;

    // Rendering props underlying layer
    const {
      lineWidthUnits,
      lineWidthScale,
      lineWidthMinPixels,
      lineWidthMaxPixels,
      lineJointRounded,
      lineMiterLimit,
      lineDashJustified,
    } = this.props;

    // Accessor props for underlying layers
    const {
      getFillColor,
      getLineColor,
      getLineWidth,
      getElevation,
      getPolygon,
      updateTriggers,
      material,
    } = this.props;

    console.log("hi");
    console.log(this.shouldRenderSubLayer("fill", table));
    // console.log(table.length);
    const FillLayer = this.getSubLayerClass("fill", GeoArrowSolidPolygonLayer);
    const StrokeLayer = this.getSubLayerClass("stroke", GeoArrowPathLayer);

    // Filled Polygon Layer
    const polygonLayer = new FillLayer(
      {
        // _dataDiff,
        extruded,
        elevationScale,

        filled,
        wireframe,
        _normalize,
        _windingOrder,

        getElevation,
        getFillColor,
        getLineColor: extruded && wireframe ? getLineColor : defaultLineColor,

        material,
        transitions,
      },
      this.getSubLayerProps({
        id: "fill",
        updateTriggers: updateTriggers && {
          getPolygon: updateTriggers.getPolygon,
          getElevation: updateTriggers.getElevation,
          getFillColor: updateTriggers.getFillColor,
          // using a legacy API to invalid lineColor attributes
          // if (extruded && wireframe) has changed
          lineColors: extruded && wireframe,
          getLineColor: updateTriggers.getLineColor,
        },
      }),
      {
        data,
        positionFormat,
        getPolygon,
      },
    );

    // Polygon line layer
    const polygonLineLayer =
      !extruded &&
      stroked &&
      new StrokeLayer(
        {
          // _dataDiff,
          widthUnits: lineWidthUnits,
          widthScale: lineWidthScale,
          widthMinPixels: lineWidthMinPixels,
          widthMaxPixels: lineWidthMaxPixels,
          jointRounded: lineJointRounded,
          miterLimit: lineMiterLimit,
          dashJustified: lineDashJustified,

          // Already normalized, and since they had been polygons, we know that
          // the lines are a loop.
          // _normalize: false,
          _pathType: "loop",

          transitions: transitions && {
            getWidth: transitions.getLineWidth,
            getColor: transitions.getLineColor,
            getPath: transitions.getPolygon,
          },

          getColor: this.getSubLayerAccessor(getLineColor),
          getWidth: this.getSubLayerAccessor(getLineWidth),
        },
        this.getSubLayerProps({
          id: "stroke",
          updateTriggers: updateTriggers && {
            getWidth: updateTriggers.getLineWidth,
            getColor: updateTriggers.getLineColor,
            getDashArray: updateTriggers.getLineDashArray,
          },
        }),
        {
          data: table,
          positionFormat,
          getPath,
        },
      );

    const layers = [
      // If not extruded: flat fill layer is drawn below outlines
      !extruded && polygonLayer,
      polygonLineLayer,
      // If extruded: draw fill layer last for correct blending behavior
      extruded && polygonLayer,
    ];
    console.log(layers);
    return layers;
  }

  _renderLayersMultiPolygon(
    geometryColumn: ga.vector.MultiPolygonVector,
  ): Layer<{}> | LayersList | null {
    return null;
  }
}
