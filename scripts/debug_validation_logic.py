
import trimesh
import numpy as np

# Create a simple watertight box
mesh = trimesh.creation.box()
print(f"Original Box: Watertight={mesh.is_watertight}")

# Export to STL
mesh.export("test_box.stl")

# Load back with process=False (My current 'Strict' logic)
mesh_strict = trimesh.load("test_box.stl", process=False)
print(f"Loaded (process=False): Watertight={mesh_strict.is_watertight}")
print(f"Loaded (process=False) Edges: {len(mesh_strict.edges)}")
is_watertight = mesh_strict.is_watertight
edges = [tuple(e) for e in mesh_strict.edges_sorted]
from collections import Counter
edge_counts = Counter(edges)
bad_edges = sum(1 for c in edge_counts.values() if c != 2)
print(f"Loaded (process=False) Bad Edges: {bad_edges}")


# Fix: Explicitly merge vertices
mesh_strict.merge_vertices()
print(f"After merge_vertices(): Watertight={mesh_strict.is_watertight}")

edges = [tuple(e) for e in mesh_strict.edges_sorted]
edge_counts = Counter(edges)
bad_edges = sum(1 for c in edge_counts.values() if c != 2)
print(f"After merge_vertices() Bad Edges: {bad_edges}")
