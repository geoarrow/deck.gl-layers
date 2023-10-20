import geopandas as gpd
import pyarrow.feather as feather
from lonboard.geoarrow.geopandas_interop import geopandas_to_geoarrow


def main():
    gdf = gpd.read_file("ne_10m_admin_0_countries.zip", engine="pyogrio")
    table = geopandas_to_geoarrow(gdf)
    feather.write_feather(
        table, "ne_10m_admin_0_countries.feather", compression="uncompressed"
    )


if __name__ == "__main__":
    main()
