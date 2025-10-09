import requests
import numpy as np
import pyarrow as pa
import pyarrow.feather as feather

url = "https://raw.githubusercontent.com/visgl/deck.gl-data/master/examples/trips/trips-v7.json"
r = requests.get(url)
data = r.json()

coord_num = 0
geoms_num = len(data)
offsets = np.zeros(geoms_num + 1, dtype=np.int32)

for i, item in enumerate(data):
    assert len(item["path"]) == len(item["timestamps"])
    coord_num += len(item["path"])
    offsets[i + 1] = coord_num

vendor = np.zeros(geoms_num, dtype=np.uint8)
coords = np.zeros((coord_num, 2), dtype=np.float32)
timestamps = np.zeros(coord_num, dtype=np.float32)

for i, item in enumerate(data):
    start_offset = offsets[i]
    end_offset = offsets[i + 1]
    path = np.array(item["path"])
    assert end_offset - start_offset == path.shape[0]
    coords[start_offset:end_offset, :] = path
    timestamps[start_offset:end_offset] = item["timestamps"]
    vendor[i] = item["vendor"]

coords_fixed_size_list = pa.FixedSizeListArray.from_arrays(
    pa.array(coords.flatten("C")), 2
)
linestrings_arr = pa.ListArray.from_arrays(pa.array(offsets), coords_fixed_size_list)
timestamp_arr = pa.ListArray.from_arrays(pa.array(offsets), timestamps)

table = pa.table(
    {"geometry": linestrings_arr, "timestamps": timestamp_arr, "vendor": vendor}
)

feather.write_feather(table, "trips.feather", compression="uncompressed")
