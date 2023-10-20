import geopandas as gpd
import numpy as np
import pyarrow as pa
import pyarrow.feather as feather
from lonboard.colormap import apply_continuous_cmap
from lonboard.geoarrow.geopandas_interop import geopandas_to_geoarrow
from palettable.colorbrewer.diverging import PRGn_11


def main():
    gdf = gpd.read_file("ne_10m_admin_0_countries.zip", engine="pyogrio")
    table = geopandas_to_geoarrow(gdf)

    log_pop_est = np.where(gdf["POP_EST"] == 0, 0, np.log10(gdf["POP_EST"]))

    min_pop = np.min(log_pop_est)
    max_pop = np.max(log_pop_est)
    normalized = (log_pop_est - min_pop) / (max_pop - min_pop)
    colors = apply_continuous_cmap(normalized, PRGn_11)

    table = table.append_column(
        "pop_colors", pa.FixedSizeListArray.from_arrays(colors.flatten("C"), 3)
    )

    feather.write_feather(
        table, "ne_10m_admin_0_countries.feather", compression="uncompressed"
    )


if __name__ == "__main__":
    main()
