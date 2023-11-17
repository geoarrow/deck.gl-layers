import * as arrow from "apache-arrow";
import {
  LineStringData,
  LineStringVector,
  MultiLineStringData,
  MultiLineStringVector,
  MultiPolygonVector,
  PolygonVector,
} from "../types";
import { getMultiPolygonChild, getPolygonChild } from "../utils";

/**
 * Get the exterior of a PolygonVector
 */
export function exteriorPolygon(vector: PolygonVector): LineStringVector {
  const exteriorData: LineStringData[] = [];
  for (const polygonData of vector.data) {
    exteriorData.push(getPolygonChild(polygonData));
  }
  return new arrow.Vector(exteriorData);
}

/**
 * Get the exterior of a MultiPolygonVector
 */
export function exteriorMultiPolygon(
  vector: MultiPolygonVector
): MultiLineStringVector {
  const exteriorData: MultiLineStringData[] = [];
  for (const multiPolygonData of vector.data) {
    exteriorData.push(getMultiPolygonChild(multiPolygonData));
  }
  return new arrow.Vector(exteriorData);
}
