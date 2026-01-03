try:
    import trimesh
    print("trimesh imported")
except ImportError as e:
    print(f"trimesh failed: {e}")

try:
    import pymeshlab
    print("pymeshlab imported")
except ImportError as e:
    print(f"pymeshlab failed: {e}")

try:
    import simple_pid
    print("simple_pid imported")
except ImportError as e:
    print(f"simple_pid failed: {e}")

try:
    from mesh_repair import repair_worker
    print("mesh_repair imported")
except ImportError as e:
    print(f"mesh_repair failed: {e}")
except Exception as e:
    print(f"mesh_repair crash: {e}")
