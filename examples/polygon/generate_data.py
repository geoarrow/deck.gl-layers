import geopandas as gpd
import pyarrow.feather as feather
from lonboard.geoarrow.geopandas_interop import geopandas_to_geoarrow


def main():
    gdf = gpd.read_file("Utah.geojson.zip", engine="pyogrio")
    table = geopandas_to_geoarrow(gdf)
    feather.write_feather(table, "utah.feather", compression="uncompressed")


if __name__ == "__main__":
    main()
