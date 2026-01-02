
import pymeshlab
if hasattr(pymeshlab, 'filter_list'):
    print("Repair/Manifold filters:")
    for f in pymeshlab.filter_list():
        if "manifold" in f or "repair" in f:
            print(f)
