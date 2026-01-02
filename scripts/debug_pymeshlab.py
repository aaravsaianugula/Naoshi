
import pymeshlab
import numpy as np

def list_filter_params():
    ms = pymeshlab.MeshSet()
    
    # Create a dummy mesh (a single triangle)
    # Vertices
    v = np.array([
        [0.0, 0.0, 0.0],
        [1.0, 0.0, 0.0],
        [0.0, 1.0, 0.0]
    ], dtype=np.float64)
    # Faces
    f = np.array([
        [0, 1, 2]
    ], dtype=np.int32)
    
    m = pymeshlab.Mesh(v, f)
    ms.add_mesh(m, "dummy_mesh")
    
    print("Listing parameters for 'generate_surface_reconstruction_screened_poisson':")
    try:
        # Try explicitly listing default values if possible
        params = ms.filter_parameter_values('generate_surface_reconstruction_screened_poisson')
        for k, v in params.items():
            print(f"Param: '{k}', Default: {v}")
    except Exception as e:
        print(f"Could not list params directly: {e}")
        try:
           # Fallback to help
           ms.apply_filter('generate_surface_reconstruction_screened_poisson', help=True)
        except Exception as e2:
            print(f"Could not print help: {e2}")

if __name__ == "__main__":
    list_filter_params()
