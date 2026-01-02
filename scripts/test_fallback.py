
import pymeshlab
import trimesh
import os

def test_pymeshlab_fallback():
    print("Testing Pymeshlab Fallback...")
    
    # Create a dummy file
    mesh = trimesh.creation.box()
    mesh.export("debug_cube.stl")
    
    try:
        ms = pymeshlab.MeshSet()
        print("Attribute: load_new_mesh")
        ms.load_new_mesh("debug_cube.stl")
        
        print("Filter: merge_close_vertices")
        ms.apply_filter('meshing_merge_close_vertices', threshold=pymeshlab.PercentageValue(0.5))
        
        print("Filter: remove_duplicate_faces")
        ms.apply_filter('meshing_remove_duplicate_faces')
        
        print("Filter: remove_null_faces")
        ms.apply_filter('meshing_remove_null_faces')
        
        print("Filter: close_holes")
        ms.apply_filter('meshing_close_holes', maxholesize=100)
        
        print("Filter: re_orient_faces_coherently")
        ms.apply_filter('meshing_re_orient_faces_coherently')
        
        print("Saving current mesh...")
        ms.save_current_mesh("debug_cube_fixed.stl")
        print("Pymeshlab test PASSED")
        
    except Exception as e:
        print(f"Pymeshlab test FAILED: {e}")
        # Print available filters if possible
        # print(ms.filter_list())

if __name__ == "__main__":
    test_pymeshlab_fallback()
