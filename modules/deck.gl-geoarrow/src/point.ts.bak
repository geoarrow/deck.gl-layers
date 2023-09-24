// NOTE: this file is not currently used until I figure out bundling
// All updates happen in the examples/point/point.ts file

// NOTE: having this file in the examples directory is a hack
// Bundling isn't currently working to load the file from the src directory,
// it fails because the code is getting transpiled to ES5 for some reason, and
// you can't subclass an ES6 class from ES5.
import {
  Accessor,
  CompositeLayer,
  CompositeLayerProps,
  Layer,
  LayersList,
  Unit,
  assert,
} from "@deck.gl/core/typed";
import { ScatterplotLayer } from "@deck.gl/layers/typed";
import * as arrow from "apache-arrow";

/** All properties supported by GeoArrowPointLayer */
export type GeoArrowPointLayerProps = _GeoArrowPointLayerProps &
  CompositeLayerProps;

/** Properties added by GeoArrowPointLayer */
export type _GeoArrowPointLayerProps = {
  data: arrow.Table;
  getPointRadius?: Accessor<any, number>;
  pointRadiusUnits?: Unit;
  pointRadiusScale?: number;
  pointRadiusMinPixels?: number;
  pointRadiusMaxPixels?: number;
  pointAntialiasing?: boolean;
  pointBillboard?: boolean;
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

export class GeoArrowPointLayer<
  ExtraProps extends {} = {}
> extends CompositeLayer<Required<GeoArrowPointLayerProps> & ExtraProps> {
  static layerName = "GeoArrowPointLayer";

  renderLayers(): Layer<{}> | LayersList | null {
    console.log("renderLayers");
    const { data } = this.props;

    const geometryColumnIndex = findGeometryColumnIndex(
      data.schema,
      "geoarrow.point"
    );
    if (geometryColumnIndex === null) {
      console.warn("No geoarrow.point column found.");
      return null;
    }

    const geometryColumn = data.getChildAt(geometryColumnIndex);
    if (!geometryColumn) {
      return null;
    }

    const layers: ScatterplotLayer[] = [];
    for (let i = 0; i < geometryColumn.data.length; i++) {
      const arrowData = geometryColumn.data[i];
      assert(arrowData.typeId === arrow.Type.FixedSizeList);

      const childBuffers = arrowData.children;
      // Should always be length one because inside the loop this should be a
      // contiguous array
      assert(childBuffers.length === 1);

      const flatCoordinateArray = childBuffers[0].values;

      const layer = new ScatterplotLayer({
        ...this.props,
        id: `${this.props.id}-geoarrow-point-${i}`,
        // @ts-expect-error
        data: {
          length: arrowData.length,
          attributes: {
            getPosition: { value: flatCoordinateArray, size: 2 },
          },
        },
        getPointRadius: 10,
        pointRadiusMinPixels: 0.8,
        getFillColor: [100, 100, 100, 255],
      });
      layers.push(layer);
    }

    return layers;
  }
}
