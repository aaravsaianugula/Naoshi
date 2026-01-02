
import pymeshlab
import numpy as np

def test_bpa():
    ms = pymeshlab.MeshSet()
    
    # Create a dummy cube-like point cloud
    # 8 corners
    v = np.array([
        [0,0,0], [1,0,0], [0,1,0], [1,1,0],
        [0,0,1], [1,0,1], [0,1,1], [1,1,1]
    ], dtype=np.float64)
    
    # Random points on faces to help BPA?
    # BPA needs density. 8 points is too sparse.
    # Let's create a dense plane.
    v_list = []
    for x in range(20):
        for y in range(20):
             v_list.append([x*0.1, y*0.1, 0])
    v = np.array(v_list, dtype=np.float64)
    
    # Create mesh with NO faces
    f = np.array([], dtype=np.int32).reshape(0, 3)
    
    m = pymeshlab.Mesh(v, f)
    ms.add_mesh(m, "point_cloud")
    
    print(f"Initial meshes: {ms.number_meshes()}")
    
    # Calc normals
    ms.apply_filter('compute_normal_for_point_clouds', k=6)
    
    # Try BPA
    print("Running BPA with radius=0 (Auto)...")
    try:
        # Use simple 0 (which assumes auto) or PercentageValue(0)
        ms.apply_filter('generate_surface_reconstruction_ball_pivoting', ballradius=pymeshlab.PercentageValue(0))
        print("BPA executed.")
    except Exception as e:
        print(f"BPA Failed: {e}")
        
    print(f"Final meshes: {ms.number_meshes()}")
    if ms.number_meshes() > 1:
        print("BPA created a NEW layer.")
    else:
        print("BPA modified existing layer or failed.")
        
    # Check if faces were added
    m_out = ms.current_mesh()
    print(f"Face count: {m_out.face_number()}")

if __name__ == "__main__":
    test_bpa()
