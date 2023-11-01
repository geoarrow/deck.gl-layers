import geopandas as gpd
import pyarrow as pa
import numpy as np
import shapely
import pyarrow.feather as feather
from geoarrow.shapely.geopandas_interop import geopandas_to_geoarrow

gdf = gpd.read_file(gpd.datasets.get_path('naturalearth_cities'))
multipoint_geom = shapely.multipoints(gdf.geometry)
gdf2 = gpd.GeoDataFrame({'a': [0]}, geometry=[multipoint_geom])

table = geopandas_to_geoarrow(gdf2)
colors = pa.FixedSizeListArray.from_arrays([255, 0, 0], 3)
table = table.append_column("colors", colors)
feather.write_feather(table, "naturalearth_cities_multipoint.feather", compression="uncompressed")
