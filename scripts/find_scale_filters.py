
import pymeshlab
for f in pymeshlab.filter_list():
    if "scale" in f.lower() or "transform" in f.lower():
        print(f)
