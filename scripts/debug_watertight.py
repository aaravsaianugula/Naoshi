import trimesh

m = trimesh.load('test_fixed.stl', process=False)
print(f'Watertight: {m.is_watertight}')
print(f'Is Volume: {m.is_volume}')
print(f'Euler: {m.euler_number}')
print(f'Faces: {len(m.faces)}')
print(f'Vertices: {len(m.vertices)}')

# Check for boundary edges (open edges indicating holes)
edges = m.edges_sorted
from collections import Counter
edge_counts = Counter(map(tuple, edges))
open_edges = [e for e, count in edge_counts.items() if count == 1]
print(f'Open edges (holes): {len(open_edges)}')

if len(open_edges) > 0:
    print('First 10 open edges:', open_edges[:10])
