// deck.gl-community
// SPDX-License-Identifier: MIT
// Copyright (c) vis.gl contributors

import { assert } from "@deck.gl/core";
import * as arrow from "apache-arrow";

export function validateAccessors(
  props: Record<string, any>,
  batch: arrow.RecordBatch,
): void {
  const vectorAccessors: arrow.Data[] = [];
  const colorVectorAccessors: arrow.Data[] = [];
  for (const [accessorName, accessorValue] of Object.entries(props)) {
    // Is it an accessor
    if (accessorName.startsWith("get")) {
      // Is it a vector accessor
      if (accessorValue instanceof arrow.Data) {
        vectorAccessors.push(accessorValue);

        // Is it a color vector accessor
        if (accessorName.endsWith("Color")) {
          colorVectorAccessors.push(accessorValue);
        }
      }
    }
  }

  validateVectorAccessors(batch, vectorAccessors);
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
  batch: arrow.RecordBatch,
  vectorAccessors: arrow.Data[],
) {
  // Check the same number of chunks as the table's batches
  for (const vectorAccessor of vectorAccessors) {
    assert(batch.numRows === vectorAccessor.length);
  }
}

export function validateColorVector(vector: arrow.Data) {
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
