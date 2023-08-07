import {
  Accessor,
  Color,
  CompositeLayer,
  CompositeLayerProps,
  Layer,
  Material,
  Unit,
  UpdateParameters,
  _ConstructorOf,
} from "@deck.gl/core/typed";
import * as arrow from "apache-arrow";
import {
  POINT_LAYER,
  LINE_LAYER,
  POLYGON_LAYER,
  getDefaultProps,
  forwardProps,
} from "./sub-layer-map";

/** All properties supported by GeoJsonLayer */
export type GeoArrowLayerProps = _GeoArrowLayerProps & CompositeLayerProps;

/** Properties added by GeoArrowLayer */
export type _GeoArrowLayerProps = {
  data: arrow.Table | arrow.Vector;

  /**
   * How to render Point and MultiPoint features in the data.
   *
   * Supported types are:
   *  * `'circle'`
   *  * `'icon'`
   *  * `'text'`
   *
   * @default 'circle'
   */
  pointType?: string;
} & _GeoArrowLayerFillProps &
  _GeoArrowLayerStrokeProps &
  _GeoArrowLayer3DProps &
  _GeoArrowLayerPointCircleProps &
  _GeoArrowLayerIconPointProps &
  _GeoArrowLayerTextPointProps;

/** GeoJsonLayer fill options. */
type _GeoArrowLayerFillProps = {
  /**
   * Whether to draw a filled polygon (solid fill).
   *
   * Note that only the area between the outer polygon and any holes will be filled.
   *
   * @default true
   */
  filled?: boolean;

  /**
   * Fill collor value or accessor.
   *
   * @default [0, 0, 0, 255]
   */
  getFillColor?: Accessor<any, Color>;
};

/** GeoJsonLayer stroke options. */
type _GeoArrowLayerStrokeProps = {
  /**
   * Whether to draw an outline around the polygon (solid fill).
   *
   * Note that both the outer polygon as well the outlines of any holes will be drawn.
   *
   * @default true
   */
  stroked?: boolean;

  /**
   * Line color value or accessor.
   *
   * @default [0, 0, 0, 255]
   */
  getLineColor?: Accessor<any, Color>;

  /**
   * Line width value or accessor.
   *
   * @default [0, 0, 0, 255]
   */
  getLineWidth?: Accessor<any, number>;

  /**
   * The units of the line width, one of `meters`, `common`, and `pixels`.
   *
   * @default 'meters'
   * @see Unit.
   */
  lineWidthUnits?: Unit;

  /**
   * A multiplier that is applied to all line widths
   *
   * @default 1
   */
  lineWidthScale?: number;

  /**
   * The minimum line width in pixels.
   *
   * @default 0
   */
  lineWidthMinPixels?: number;

  /**
   * The maximum line width in pixels
   *
   * @default Number.MAX_SAFE_INTEGER
   */
  lineWidthMaxPixels?: number;

  /**
   * Type of joint. If `true`, draw round joints. Otherwise draw miter joints.
   *
   * @default false
   */
  lineJointRounded?: boolean;

  /**
   * The maximum extent of a joint in ratio to the stroke width.
   *
   * Only works if `lineJointRounded` is false.
   *
   * @default 4
   */
  lineMiterLimit?: number;

  /**
   * Type of line caps.
   *
   * If `true`, draw round caps. Otherwise draw square caps.
   *
   * @default false
   */
  lineCapRounded?: boolean;

  /**
   * If `true`, extrude the line in screen space (width always faces the camera).
   * If `false`, the width always faces up.
   *
   * @default false
   */
  lineBillboard?: boolean;
};

/** GeoJsonLayer 3D options. */
type _GeoArrowLayer3DProps = {
  /**
   * Extrude Polygon and MultiPolygon features along the z-axis if set to true
   *
   * Based on the elevations provided by the `getElevation` accessor.
   *
   * @default false
   */
  extruded?: boolean;

  /**
   * Whether to generate a line wireframe of the hexagon.
   *
   * @default false
   */
  wireframe?: boolean;

  /**
   * (Experimental) This prop is only effective with `XYZ` data.
   * When true, polygon tesselation will be performed on the plane with the largest area, instead of the xy plane.
   * @default false
   */
  _full3d?: boolean;

  /**
   * Elevation valur or accessor.
   *
   * Only used if `extruded: true`.
   *
   * @default 1000
   */
  getElevation?: Accessor<any, number>;

  /**
   * Elevation multiplier.
   *
   * The final elevation is calculated by `elevationScale * getElevation(d)`.
   * `elevationScale` is a handy property to scale all elevation without updating the data.
   *
   * @default 1
   */
  elevationScale?: boolean;

  /**
   * Material settings for lighting effect. Applies to extruded polgons.
   *
   * @default true
   * @see https://deck.gl/docs/developer-guide/using-lighting
   */
  material?: Material;
};

const defaultProps: DefaultProps<GeoArrowLayerProps> = {
  ...getDefaultProps(POINT_LAYER.circle),
  ...getDefaultProps(POINT_LAYER.icon),
  ...getDefaultProps(POINT_LAYER.text),
  ...getDefaultProps(LINE_LAYER),
  ...getDefaultProps(POLYGON_LAYER),

  // Overwrite sub layer defaults
  stroked: true,
  filled: true,
  extruded: false,
  wireframe: false,
  _full3d: false,
  iconAtlas: { type: "object", value: null },
  iconMapping: { type: "object", value: {} },
  getIcon: { type: "accessor", value: (f) => f.properties.icon },
  getText: { type: "accessor", value: (f) => f.properties.text },

  // Self props
  pointType: "circle",

  // TODO: deprecated, remove in v9
  getRadius: { deprecatedFor: "getPointRadius" },
};


/** GeoJsonLayer Properties forwarded to `ScatterPlotLayer` if `pointType` is `'circle'` */
export type _GeoArrowLayerPointCircleProps = {
  getPointRadius?: Accessor<any, number>;
  pointRadiusUnits?: Unit;
  pointRadiusScale?: number;
  pointRadiusMinPixels?: number;
  pointRadiusMaxPixels?: number;
  pointAntialiasing?: boolean;
  pointBillboard?: boolean;

  /** @deprecated use getPointRadius */
  getRadius?: Accessor<any, number>;
};

/** GeoJsonLayer properties forwarded to `IconLayer` if `pointType` is `'icon'` */
type _GeoArrowLayerIconPointProps = {
  iconAtlas?: any;
  iconMapping?: any;
  getIcon?: Accessor<any, any>;
  getIconSize?: Accessor<any, number>;
  getIconColor?: Accessor<any, Color>;
  getIconAngle?: Accessor<any, number>;
  getIconPixelOffset?: Accessor<any, number[]>;
  iconSizeUnits?: Unit;
  iconSizeScale?: number;
  iconSizeMinPixels?: number;
  iconSizeMaxPixels?: number;
  iconBillboard?: boolean;
  iconAlphaCutoff?: number;
};

/** GeoJsonLayer properties forwarded to `TextLayer` if `pointType` is `'text'` */
type _GeoArrowLayerTextPointProps = {
  getText?: Accessor<any, any>;
  getTextColor?: Accessor<any, Color>;
  getTextAngle?: Accessor<any, number>;
  getTextSize?: Accessor<any, number>;
  getTextAnchor?: Accessor<any, string>;
  getTextAlignmentBaseline?: Accessor<any, string>;
  getTextPixelOffset?: Accessor<any, number[]>;
  getTextBackgroundColor?: Accessor<any, Color>;
  getTextBorderColor?: Accessor<any, Color>;
  getTextBorderWidth?: Accessor<any, number>;
  textSizeUnits?: Unit;
  textSizeScale?: number;
  textSizeMinPixels?: number;
  textSizeMaxPixels?: number;
  textCharacterSet?: any;
  textFontFamily?: string;
  textFontWeight?: number;
  textLineHeight?: number;
  textMaxWidth?: number;
  textWordBreak?: string; // TODO
  textBackground?: boolean;
  textBackgroundPadding?: number[];
  textOutlineColor?: Color;
  textOutlineWidth?: number;
  textBillboard?: boolean;
  textFontSettings?: any;
};

export default class GeoArrowLayer<
  ExtraProps extends {} = {}
> extends CompositeLayer<Required<GeoArrowLayerProps> & ExtraProps> {
  static layerName = "GeoArrowLayer";

  initializeState(): void {
    this.state = {
      layerProps: {},
      features: {},
    };
  }

  updateState({
    props,
    oldProps,
    changeFlags,
    context,
  }: UpdateParameters<this>): void {
    if (!changeFlags.dataChanged) {
      return;
    }
    const { data } = this.props;
    const isVector = data instanceof arrow.Vector;
    this.setState({ isVector });

    if (data instanceof arrow.Vector) {
      this._updateStateVector({ props, oldProps, changeFlags, context });
    } else if (data instanceof arrow.Table) {
      this._updateStateTable({ props, oldProps, changeFlags, context });
    }
  }

  /**
   * Update state for a vector as input
   */
  private _updateStateVector({
    props,
    changeFlags,
  }: UpdateParameters<this>): void {}

  /**
   * Update state for a table as input
   */
  private _updateStateTable({
    props,
    changeFlags,
  }: UpdateParameters<this>): void {}

  renderLayers() {
    const { extruded } = this.props;

    const polygonFillLayer = this._renderPolygonLayer();
    const lineLayers = this._renderLineLayers();
    const pointLayers = this._renderPointLayers();

    return [
      // If not extruded: flat fill layer is drawn below outlines
      !extruded && polygonFillLayer,
      lineLayers,
      pointLayers,
      // If extruded: draw fill layer last for correct blending behavior
      extruded && polygonFillLayer,
    ];
  }

  protected getSubLayerAccessor<In, Out>(
    accessor: Accessor<In, Out>
  ): Accessor<In, Out> {
    const { binary } = this.state;
    if (!binary || typeof accessor !== "function") {
      return super.getSubLayerAccessor(accessor);
    }

    return (object, info) => {
      const { data, index } = info;
      const feature = binaryToFeatureForAccesor(
        data as unknown as BinaryFeatureTypes,
        index
      );
      // @ts-ignore (TS2349) accessor is always function
      return accessor(feature, info);
    };
  }

  private _renderPolygonLayer(): Layer | null {
    const { extruded, wireframe } = this.props;
    const { layerProps } = this.state;
    const id = "polygons-fill";

    const PolygonFillLayer =
      this.shouldRenderSubLayer(id, layerProps.polygons.data) &&
      this.getSubLayerClass(id, POLYGON_LAYER.type);

    if (PolygonFillLayer) {
      const forwardedProps = forwardProps(this, POLYGON_LAYER.props);
      // Avoid building the lineColors attribute if wireframe is off
      const useLineColor = extruded && wireframe;
      if (!useLineColor) {
        delete forwardedProps.getLineColor;
      }
      // using a legacy API to invalid lineColor attributes
      forwardedProps.updateTriggers.lineColors = useLineColor;

      return new PolygonFillLayer(
        forwardedProps,
        this.getSubLayerProps({
          id,
          updateTriggers: forwardedProps.updateTriggers,
        }),
        layerProps.polygons
      );
    }
    return null;
  }

  private _renderLineLayers(): (Layer | false)[] | null {
    const { extruded, stroked } = this.props;
    const { layerProps } = this.state;
    const polygonStrokeLayerId = "polygons-stroke";
    const lineStringsLayerId = "linestrings";

    const PolygonStrokeLayer =
      !extruded &&
      stroked &&
      this.shouldRenderSubLayer(
        polygonStrokeLayerId,
        layerProps.polygonsOutline.data
      ) &&
      this.getSubLayerClass(polygonStrokeLayerId, LINE_LAYER.type);
    const LineStringsLayer =
      this.shouldRenderSubLayer(lineStringsLayerId, layerProps.lines.data) &&
      this.getSubLayerClass(lineStringsLayerId, LINE_LAYER.type);

    if (PolygonStrokeLayer || LineStringsLayer) {
      const forwardedProps = forwardProps(this, LINE_LAYER.props);

      return [
        PolygonStrokeLayer &&
          new PolygonStrokeLayer(
            forwardedProps,
            this.getSubLayerProps({
              id: polygonStrokeLayerId,
              updateTriggers: forwardedProps.updateTriggers,
            }),
            layerProps.polygonsOutline
          ),

        LineStringsLayer &&
          new LineStringsLayer(
            forwardedProps,
            this.getSubLayerProps({
              id: lineStringsLayerId,
              updateTriggers: forwardedProps.updateTriggers,
            }),
            layerProps.lines
          ),
      ];
    }
    return null;
  }

  private _renderPointLayers(): Layer[] | null {
    const { pointType } = this.props;
    const { layerProps, binary } = this.state;
    let { highlightedObjectIndex } = this.props;

    if (!binary && Number.isFinite(highlightedObjectIndex)) {
      highlightedObjectIndex = layerProps.points.data.findIndex(
        (d) => d.__source.index === highlightedObjectIndex
      );
    }

    // Avoid duplicate sub layer ids
    const types = new Set(pointType.split("+"));
    const pointLayers: Layer[] = [];
    for (const type of types) {
      const id = `points-${type}`;
      const PointLayerMapping = POINT_LAYER[type];
      const PointsLayer: _ConstructorOf<Layer> =
        PointLayerMapping &&
        this.shouldRenderSubLayer(id, layerProps.points.data) &&
        this.getSubLayerClass(id, PointLayerMapping.type);
      if (PointsLayer) {
        const forwardedProps = forwardProps(this, PointLayerMapping.props);
        let pointsLayerProps = layerProps.points;

        if (type === "text" && binary) {
          // Picking colors are per-point but for text per-character are required
          // getPickingInfo() maps back to the correct index
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { instancePickingColors, ...rest } =
            pointsLayerProps.data.attributes;
          pointsLayerProps = {
            ...pointsLayerProps,
            data: { ...pointsLayerProps.data, attributes: rest },
          };
        }

        pointLayers.push(
          new PointsLayer(
            forwardedProps,
            this.getSubLayerProps({
              id,
              updateTriggers: forwardedProps.updateTriggers,
              highlightedObjectIndex,
            }),
            pointsLayerProps
          )
        );
      }
    }
    return pointLayers;
  }
}
