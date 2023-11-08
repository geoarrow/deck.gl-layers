import geopandas as gpd
import pandas as pd
import pyarrow.feather as feather
import shapely
from lonboard._geoarrow.geopandas_interop import geopandas_to_geoarrow


def main():
    url = "https://raw.githubusercontent.com/visgl/deck.gl-data/master/examples/text-layer/cities-1000.csv"
    df = pd.read_csv(url)
    geometry = shapely.points(df["longitude"], df["latitude"])
    gdf = gpd.GeoDataFrame(df[["name", "population"]], geometry=geometry)
    table = geopandas_to_geoarrow(gdf)

    feather.write_feather(table, "text.arrow", compression="uncompressed")


if __name__ == "__main__":
    main()
