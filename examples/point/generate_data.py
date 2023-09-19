import pandas as pd
import pyarrow as pa
import pyarrow.feather as feather
import shapely


class PointGeometryType(pa.ExtensionType):
    def __init__(self):
        pa.ExtensionType.__init__(self, self._storage_type, self._extension_name)

    _storage_type = pa.list_(pa.field("xy", pa.float64()), 2)
    _extension_name = "geoarrow.point"

    def __arrow_ext_serialize__(self):
        # since we don't have a parameterized type, we don't need extra
        # metadata to be deserialized
        return b""

    @classmethod
    def __arrow_ext_deserialize__(cls, storage_type, serialized):
        # return an instance of this subclass given the serialized
        # metadata.
        return PointGeometryType()


# https://ookla-open-data.s3.us-west-2.amazonaws.com/parquet/performance/type=mobile/year=2019/quarter=1/2019-01-01_performance_mobile_tiles.parquet


def main():
    df = pd.read_parquet("2019-01-01_performance_mobile_tiles.parquet")
    centroids = shapely.centroid(shapely.from_wkt(df["tile"]))

    # Save space by using a smaller data type
    df_cols = ["avg_d_kbps", "avg_u_kbps", "avg_lat_ms"]
    for col in df_cols:
        df[col] = pd.to_numeric(df[col], downcast="unsigned")

    table = pa.Table.from_pandas(df[df_cols])
    coords = shapely.get_coordinates(centroids)
    parr = pa.FixedSizeListArray.from_arrays(coords.flatten(), 2)
    extension_arr = pa.ExtensionArray.from_storage(PointGeometryType(), parr)
    table = table.append_column("geometry", extension_arr)
    feather.write_feather(
        table, "2019-01-01_performance_mobile_tiles.feather", compression="uncompressed"
    )


if __name__ == "__main__":
    main()
