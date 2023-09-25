import geopandas as gpd
import pyarrow as pa
import pyarrow.feather as feather
from geoarrow.shapely.geopandas_interop import geopandas_to_geoarrow


def main():
    gdf = gpd.read_file("Utah.geojson")
    table = geopandas_to_geoarrow(gdf)
    # rechunk
    table = pa.Table.from_batches(table.to_batches(max_chunksize=100_000))
    feather.write_feather(table, "utah.feather", compression="uncompressed")


if __name__ == "__main__":
    main()
