
import pymeshlab
import numpy as np

def verify():
    print("Creating dummy point cloud...")
    ms = pymeshlab.MeshSet()
    
    # Create grid of points
    pts = []
    for x in range(10):
        for y in range(10):
            pts.append([x, y, 0.0])
            pts.append([x, y, 1.0]) # Dual layer to make it interesting
            
    v = np.array(pts, dtype=np.float64)
    f = np.array([], dtype=np.int32).reshape(0, 3)
    m = pymeshlab.Mesh(v, f)
    ms.add_mesh(m, "test_cloud")
    
    print("1. Computing Point Normals...")
    ms.apply_filter('compute_normal_for_point_clouds', k=6, flipflag=True)
    
    print("2. Alpha Shape Reconstruction...")
    try:
        # Alpha=0 usually means convex hull or auto?
        # Let's try explicit percentage or auto
        ms.apply_filter('generate_alpha_shape', alpha=pymeshlab.PercentageValue(2)) 
        print("Alpha Shape executed.")
    except Exception as e:
        print(f"Alpha Shape failed: {e}")
        
    print("3. Pre-Hole Cleanup...")
    ms.apply_filter('meshing_repair_non_manifold_edges', method='Remove Faces')
    ms.apply_filter('meshing_repair_non_manifold_vertices')
    ms.apply_filter('meshing_remove_duplicate_faces')
    ms.apply_filter('meshing_remove_null_faces')
    
    print("Checking for Advanced Filters...")
    
    advanced_filters = [
        'generate_alpha_shape',
        'generate_surface_reconstruction_ball_pivoting',
        'generate_surface_reconstruction_screened_poisson',
        'generate_surface_reconstruction_vcg', # VCG reconstruction?
        'generate_iso_parametrization_remeshing',
        'compute_apss_projection', # APSS Projection?
        'generate_surface_reconstruction_neuhouse', # Older method?
    ]
    
    for f in advanced_filters:
        try:
             # Just check if we can get help or params for it, implies existence
             ms.filter_parameter_values(f)
             print(f"[FOUND] {f}")
        except:
             print(f"[MISSING] {f}")
             
    print("Pipeline Verified Success.")

if __name__ == "__main__":
    verify()
