
import trimesh
import numpy as np
from mesh_repair import repair_worker, analyze_stl
import os
import queue

def create_broken_mesh(filename):
    # Create a cube
    mesh = trimesh.creation.box()
    # Remove a face to create a hole
    mask = np.ones(len(mesh.faces), dtype=bool)
    mask[0] = False
    mesh.update_faces(mask)
    
    # Export
    mesh.export(filename)
    return filename

def test_pipeline():
    broken_file = "test_broken.stl"
    fixed_file = "test_fixed.stl"
    
    # Generate
    create_broken_mesh(broken_file)
    print(f"Created broken mesh: {broken_file}")
    
    # Analyze
    stats_before = analyze_stl(broken_file)
    print("Stats Before:", stats_before)
    if stats_before['is_watertight']:
        print("ERROR: Mesh should be broken but is reported as watertight!")
        return
        
    # Repair
    print("Repairing (Queue Mode)...")
    q = queue.Queue()
    
    # Run synchronously for test
    repair_worker(broken_file, fixed_file, q)
    
    # Read Queue
    result = None
    while not q.empty():
        msg = q.get()
        if msg[0] == 'done':
            result = msg[1]
        elif msg[0] == 'error':
            print("ERROR:", msg[1])
            return

    print("Repair Result:", result)
    
    if result and result['success']:
        print(f"SUCCESS! Method used: {result['method']}")
        
        # Analyze After
        stats_after = analyze_stl(fixed_file)
        print("Stats After:", stats_after)
        
        if stats_after['is_watertight']:
            print("Verification: Mesh is watertight!")
        else:
            print("Verification: Mesh still has gaps.")
    else:
        print("Repair failed.")
        
    # Clean up
    # os.remove(broken_file)
    # os.remove(fixed_file)

if __name__ == "__main__":
    test_pipeline()
