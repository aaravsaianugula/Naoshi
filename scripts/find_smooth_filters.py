
import pymeshlab
for f in pymeshlab.filter_list():
    if "smooth" in f.lower():
        print(f)
