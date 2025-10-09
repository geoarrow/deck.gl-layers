import geopandas as gpd
import pyarrow.feather as feather
from lonboard import SolidPolygonLayer


def main():
    gdf = gpd.read_file("Utah.geojson.zip", engine="pyogrio")
    layer = SolidPolygonLayer.from_geopandas(gdf)
    feather.write_feather(layer.table, "utah.feather", compression="uncompressed")

    gdf = gpd.read_file(gpd.datasets.get_path("nybb"))
    layer = SolidPolygonLayer.from_geopandas(gdf)
    feather.write_feather(layer.table, "nybb.feather", compression="uncompressed")


if __name__ == "__main__":
    main()
