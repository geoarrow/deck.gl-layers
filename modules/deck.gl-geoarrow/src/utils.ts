import * as arrow from "apache-arrow";

export function findGeometryColumnIndex(
  schema: arrow.Schema,
  extensionName: string
): number | null {
  const index = schema.fields.findIndex(
    (field) => field.metadata.get("ARROW:extension:name") === extensionName
  );
  return index !== -1 ? index : null;
}
