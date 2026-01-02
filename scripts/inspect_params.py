
import pymeshlab
ms = pymeshlab.MeshSet()
# This prints params to stdout
print("NON MANIFOLD EDGES PARAMS:")
if hasattr(pymeshlab, 'print_filter_parameter_list'):
    pymeshlab.print_filter_parameter_list('meshing_repair_non_manifold_edges')
    print("\nNON MANIFOLD VERTICES PARAMS:")
    pymeshlab.print_filter_parameter_list('meshing_repair_non_manifold_vertices')
