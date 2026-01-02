
import pymeshlab
if hasattr(pymeshlab, 'filter_list'):
    print("Poisson filters:")
    for f in pymeshlab.filter_list():
        if "poisson" in f.lower():
            print(f)
