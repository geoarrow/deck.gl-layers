import { assert } from "@deck.gl/core/typed";
import * as arrow from "apache-arrow";

export type TypedArray =
  | Uint8Array
  | Uint8ClampedArray
  | Uint16Array
  | Uint32Array
  | Int8Array
  | Int16Array
  | Int32Array
  | Float32Array
  | Float64Array;

export function findGeometryColumnIndex(
  schema: arrow.Schema,
  extensionName: string
): number | null {
  const index = schema.fields.findIndex(
    (field) => field.metadata.get("ARROW:extension:name") === extensionName
  );
  return index !== -1 ? index : null;
}

/**
 * Returns `true` if the input is a reference to a column in the table
 */
export function isColumnReference(input: any): input is string {
  return typeof input === "string";
}

// export function resolveFloatAccessor(value)

function isDataInterleavedCoords(
  data: arrow.Data
): data is arrow.Data<arrow.FixedSizeList<arrow.Float64>> {
  // TODO: also check 2 or 3d? Float64?
  return data.type instanceof arrow.FixedSizeList;
}

function isDataSeparatedCoords(
  data: arrow.Data
): data is arrow.Data<arrow.Struct<{ x: arrow.Float64; y: arrow.Float64 }>> {
  // TODO: also check child names? Float64?
  return data.type instanceof arrow.Struct;
}

/**
 * Convert geoarrow Struct coordinates to FixedSizeList coords
 *
 * The GeoArrow spec allows for either separated or interleaved coords, but at
 * this time deck.gl only supports interleaved.
 */
// TODO: this hasn't been tested yet
function convertStructToFixedSizeList(
  coords:
    | arrow.Data<arrow.FixedSizeList<arrow.Float64>>
    | arrow.Data<arrow.Struct<{ x: arrow.Float64; y: arrow.Float64 }>>
): arrow.Data<arrow.FixedSizeList<arrow.Float64>> {
  if (isDataInterleavedCoords(coords)) {
    return coords;
  } else if (isDataSeparatedCoords(coords)) {
    // TODO: support 3d
    const interleavedCoords = new Float64Array(coords.length * 2);
    const [xChild, yChild] = coords.children;
    for (let i = 0; i < coords.length; i++) {
      interleavedCoords[i * 2] = xChild.values[i];
      interleavedCoords[i * 2 + 1] = yChild.values[i];
    }

    const childDataType = new arrow.Float64();
    const dataType = new arrow.FixedSizeList(
      2,
      new arrow.Field("coords", childDataType)
    );

    const interleavedCoordsData = arrow.makeData({
      type: childDataType,
      length: interleavedCoords.length,
    });

    const data = arrow.makeData({
      type: dataType,
      length: coords.length,
      nullCount: coords.nullCount,
      nullBitmap: coords.nullBitmap,
      child: interleavedCoordsData,
    });
    return data;
  }

  assert(false);
}

type AssignAccessorProps = {
  /** The object on which to assign the resolved accesor */
  props: object;
  /** The name of the prop to set */
  propName: string;
  /** The user-supplied input to the layer. Must either be a scalar value or a reference to a column in the table. */
  propInput: any;
  /** A single arrow.RecordBatch of the table */
  recordBatch: arrow.RecordBatch;
  /** a map from the geometry index to the coord offsets for that geometry. */
  geomCoordOffsets?: Int32Array | null;
};

/**
 * Resolve accessor and assign to props object
 *
 * This is useful as a helper function because a scalar prop is set at the top
 * level while a vectorized prop is set inside data.attributes
 *
 * @param props :
 * @param propName :
 * @param propInput :
 * @param recordBatch :
 */
export function assignAccessor(args: AssignAccessorProps) {
  const { props, propName, propInput, recordBatch, geomCoordOffsets } = args;

  if (propInput === undefined) {
    return;
  }

  if (isColumnReference(propInput)) {
    const column = recordBatch.getChild(propInput);
    // The underlying data should always be contiguous in a record batch
    assert(column.data.length === 1);
    const columnData = column.data[0];

    if (arrow.DataType.isFixedSizeList(columnData)) {
      assert(columnData.children.length === 1);
      let values = columnData.children[0].values;

      if (geomCoordOffsets) {
        values = expandArrayToCoords(
          values,
          columnData.type.listSize,
          geomCoordOffsets
        );
      }

      // @ts-expect-error Property 'data' does not exist on type 'object'.
      props.data.attributes[propName] = {
        value: values,
        size: columnData.type.listSize,
      };
    } else if (arrow.DataType.isFloat(columnData)) {
      let values = columnData.values;

      if (geomCoordOffsets) {
        values = expandArrayToCoords(values, 1, geomCoordOffsets);
      }

      // @ts-expect-error Property 'data' does not exist on type 'object'.
      props.data.attributes[propName] = {
        value: values,
        size: 1,
      };
    }
  } else {
    props[propName] = propInput;
  }
}

/**
 * Expand an array from "one element per geometry" to "one element per coordinate"
 *
 * @param input: the input array to expand
 * @param size : the number of nested elements in the input array per geometry. So for example, for RGB data this would be 3, for RGBA this would be 4. For radius, this would be 1.
 * @param geomOffsets : an offsets array mapping from the geometry to the coordinate indexes. So in the case of a LineStringArray, this is retrieved directly from the GeoArrow storage. In the case of a PolygonArray, this comes from the resolved indexes that need to be given to the SolidPolygonLayer anyways.
 *
 * @return  {TypedArray} values expanded to be per-coordinate
 */
export function expandArrayToCoords<T extends TypedArray>(
  input: T,
  size: number,
  geomOffsets: Int32Array
): T {
  const numCoords = geomOffsets[geomOffsets.length - 1];
  // @ts-expect-error
  const outputArray: T = new input.constructor(numCoords * size);

  // geomIdx is an index into the geomOffsets array
  // geomIdx is also the geometry/table index
  for (let geomIdx = 0; geomIdx < geomOffsets.length - 1; geomIdx++) {
    // geomOffsets maps from the geometry index to the coord index
    // So here we get the range of coords that this geometry covers
    const lastCoordIdx = geomOffsets[geomIdx];
    const nextCoordIdx = geomOffsets[geomIdx + 1];

    // Iterate over this range of coord indices
    for (let coordIdx = lastCoordIdx; coordIdx < nextCoordIdx; coordIdx++) {
      // Iterate over size
      for (let i = 0; i < size; i++) {
        // Copy from the geometry index in `input` to the coord index in
        // `output`
        outputArray[coordIdx * size + i] = input[geomIdx * size + i];
      }
    }
  }

  return outputArray;
}
