
import pymeshlab
ms = pymeshlab.MeshSet()
print("Searching for re-orient filters:")
# Check module level
if hasattr(pymeshlab, 'filter_list'):
    print("Printing from pymeshlab.filter_list():")
    for f in pymeshlab.filter_list():
        if "orient" in f:
            print(f)
else:
    print("Could not find filter_list")
