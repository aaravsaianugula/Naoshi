
import pymeshlab
for f in pymeshlab.filter_list():
    if "normal" in f.lower():
        print(f)
