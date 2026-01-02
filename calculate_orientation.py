import trimesh
import numpy as np
import sys
import json

def get_best_orientation(filepath):
    """
    Calculates the most stable pose for a mesh.
    Returns the 4x4 transformation matrix.
    """
    try:
        mesh = trimesh.load(filepath, process=False)
        
        # compute_stable_poses uses convex hull, which is fast
        transforms, probs = trimesh.poses.compute_stable_poses(mesh)
        
        # Get the most probable stable pose (highest probability)
        # They are usually sorted, but let's be safe
        best_idx = np.argmax(probs)
        best_transform = transforms[best_idx]
        
        # Convert to list for JSON serialization
        return best_transform.tolist()
        
    except Exception as e:
        sys.stderr.write(str(e))
        return np.eye(4).tolist()

if __name__ == "__main__":
    if len(sys.argv) > 1:
        fp = sys.argv[1]
        matrix = get_best_orientation(fp)
        print(json.dumps(matrix))
