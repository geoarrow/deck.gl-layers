import { assert } from "@deck.gl/core/typed";
import * as arrow from "apache-arrow";
import { Coord, LineString, MultiPoint, Polygon } from "./types";

export function validateAccessors(
  props: Record<string, any>,
  table: arrow.Table,
): void {
  const vectorAccessors: arrow.Vector[] = [];
  const colorVectorAccessors: arrow.Vector[] = [];
  for (const [accessorName, accessorValue] of Object.entries(props)) {
    // Is it an accessor
    if (accessorName.startsWith("get")) {
      // Is it a vector accessor
      if (accessorValue instanceof arrow.Vector) {
        vectorAccessors.push(accessorValue);

        // Is it a color vector accessor
        if (accessorName.endsWith("Color")) {
          colorVectorAccessors.push(accessorValue);
        }
      }
    }
  }

  validateVectorAccessors(table, vectorAccessors);
  for (const colorVectorAccessor of colorVectorAccessors) {
    validateColorVector(colorVectorAccessor);
  }
}

/**
 * Provide validation for accessors provided
 *
 * - Assert that all vectors have the same number of chunks as the main table
 * - Assert that all chunks in each vector have the same number of rows as the
 *   relevant batch in the main table.
 *
 */
export function validateVectorAccessors(
  table: arrow.Table,
  vectorAccessors: arrow.Vector[],
) {
  // Check the same number of chunks as the table's batches
  for (const vectorAccessor of vectorAccessors) {
    assert(table.batches.length === vectorAccessor.data.length);
  }

  // Check that each table batch/vector data has the same number of rows
  for (const vectorAccessor of vectorAccessors) {
    for (let i = 0; i < table.batches.length; i++) {
      assert(table.batches[i].numRows === vectorAccessor.data[i].length);
    }
  }
}

export function validateColorVector(vector: arrow.Vector) {
  // Assert the color vector is a FixedSizeList
  assert(arrow.DataType.isFixedSizeList(vector.type));

  // Assert it has 3 or 4 values
  assert(vector.type.listSize === 3 || vector.type.listSize === 4);

  // Assert the child type is an integer
  assert(arrow.DataType.isInt(vector.type.children[0]));

  // Assert the child type is a Uint8
  // @ts-ignore
  // Property 'type' does not exist on type 'Int_<Ints>'. Did you mean 'TType'?
  assert(vector.type.children[0].type.bitWidth === 8);
}

export function validatePointType(type: arrow.DataType): type is Coord {
  // Assert the point vector is a FixedSizeList
  // TODO: support struct
  assert(arrow.DataType.isFixedSizeList(type));

  // Assert it has 2 or 3 values
  assert(type.listSize === 2 || type.listSize === 3);

  // Assert the child type is a float
  assert(arrow.DataType.isFloat(type.children[0]));

  return true;
}

export function validateLineStringType(
  type: arrow.DataType,
): type is LineString {
  // Assert the outer vector is a List
  assert(arrow.DataType.isList(type));

  // Assert its inner vector is a point layout
  validatePointType(type.children[0].type);

  return true;
}

export function validatePolygonType(type: arrow.DataType): type is Polygon {
  // Assert the outer vector is a List
  assert(arrow.DataType.isList(type));

  // Assert its inner vector is a linestring layout
  validateLineStringType(type.children[0].type);

  return true;
}

// Note: this is the same as validateLineStringType
export function validateMultiPointType(
  type: arrow.DataType,
): type is MultiPoint {
  // Assert the outer vector is a List
  assert(arrow.DataType.isList(type));

  // Assert its inner vector is a point layout
  validatePointType(type.children[0].type);

  return true;
}

export function validateMultiLineStringType(
  type: arrow.DataType,
): type is Polygon {
  // Assert the outer vector is a List
  assert(arrow.DataType.isList(type));

  // Assert its inner vector is a linestring layout
  validateLineStringType(type.children[0].type);

  return true;
}

export function validateMultiPolygonType(
  type: arrow.DataType,
): type is Polygon {
  // Assert the outer vector is a List
  assert(arrow.DataType.isList(type));

  // Assert its inner vector is a linestring layout
  validatePolygonType(type.children[0].type);

  return true;
}
