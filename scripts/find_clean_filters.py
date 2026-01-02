
import pymeshlab
for f in pymeshlab.filter_list():
    if "unreferenced" in f.lower():
        print(f)
