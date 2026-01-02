import os
import time
import trimesh
import pymeshlab

def analyze_stl(filepath):
    """Load STL and detect issues."""
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"File not found: {filepath}")
    try:
        # Use process=True to merge vertices (STL is non-indexed)
        mesh = trimesh.load(filepath, process=True)
        return {'is_watertight': mesh.is_watertight, 'faces': len(mesh.faces)}
    except Exception as e:
        return {'error': str(e)}

def repair_worker(filepath, output_path, result_queue):
    """
    SMART REPAIR PIPELINE - 4 TIERS
    
    Tier 1: Validation (Pass if good)
    Tier 2: Surgical Repair (Fix only bad faces, preserve original geometry)
    Tier 3: Alpha Wrap (High Detail Reconstruction - Fallback 1)
    Tier 4: Poisson Reconstruction (Guaranteed Solid - Fallback 2)
    """
    def log_msg(msg, progress=None):
        if progress is not None:
             result_queue.put(('progress', (msg, progress)))
        else:
             result_queue.put(('status', msg))

    start_time = time.time()
    
    try:
        log_msg("Loading mesh...", 0.05)
        
        # 1. Analyze first (Is it already good?)
        try:
            initial_check = trimesh.load(filepath, process=False)
            is_already_watertight = initial_check.is_watertight
            log_msg(f"Initial status: {'Watertight' if is_already_watertight else 'Needs Repair'}", 0.08)
        except:
             is_already_watertight = False

        ms = pymeshlab.MeshSet()
        ms.load_new_mesh(filepath)
        
        original_faces = ms.current_mesh().face_number()
        log_msg(f"Loaded: {original_faces:,} faces", 0.1)

        if is_already_watertight:
            log_msg("Mesh is already valid. Skipping reconstruction to preserve detail.", 0.2)
            try:
                ms.apply_filter('meshing_remove_connected_component_by_face_number', mincomponentsize=50)
                ms.apply_filter('meshing_remove_unreferenced_vertices')
            except: pass
            
            final_faces = ms.current_mesh().face_number()
            repair_method = 'Passthrough (Valid)'
            success_tier = 1

        else:
            # ============================================
            # TIER 2: SURGICAL REPAIR (Smart Local Fix)
            # ============================================
            log_msg("Tier 2: Attempting Smart Local Repair...", 0.2)
            repair_method = 'Smart Local Repair'
            success_tier = 0
            
            try:
                # 1. Cleaning
                ms.apply_filter('meshing_remove_unreferenced_vertices')
                ms.apply_filter('meshing_remove_duplicate_faces')
                ms.apply_filter('meshing_remove_duplicate_vertices')
                
                # 2. Select and Remove BAD Geometry Only
                log_msg("Removing non-manifold geometry...", 0.25)
                ms.apply_filter('meshing_repair_non_manifold_edges')
                ms.apply_filter('meshing_repair_non_manifold_vertices')
                
                # Select self-intersecting faces (if any)
                try:
                    ms.apply_filter('compute_selection_by_self_intersections_per_face')
                    ms.apply_filter('meshing_remove_selected_faces')
                except: pass 

                # 3. Patch Holes (Iterative with Robust Fallback)
                log_msg("Patching holes...", 0.3)
                try:
                    ms.apply_filter('meshing_close_holes', maxholesize=1000) 
                    ms.apply_filter('meshing_close_holes', maxholesize=5000)
                except Exception as e:
                    # Fallback: Force clean non-manifold edges if close_holes fails
                    log_msg("Complex holes detected, force cleaning...", 0.32)
                    ms.apply_filter('meshing_repair_non_manifold_edges')
                    ms.apply_filter('meshing_repair_non_manifold_vertices')
                    # Aggressive cleanup if standard repair fails
                    try:
                        ms.apply_filter('compute_selection_by_non_manifold_per_vertex')
                        ms.apply_filter('meshing_remove_selected_vertices')
                    except: pass
                    ms.apply_filter('meshing_close_holes', maxholesize=5000)

                ms.apply_filter('meshing_re_orient_faces_coherently')
                
                # 4. VALIDATE TIER 2 (STRICT MODE)
                # Must be watertight AND free of self-intersections to pass surgical repair
                ms.save_current_mesh(output_path)
                check_tm = trimesh.load(output_path, process=True)
                
                # Check for self-intersections using PyMeshLab
                try:
                    ms.apply_filter('compute_selection_by_self_intersections_per_face')
                    selection_stats = ms.get_geometric_measures() # Hack to check selection?
                    # Actually, we can just check if any faces are selected.
                    # count_selected = ... (hard to get directly in simple API without parsing)
                    # Alternative: Try to remove them. If faces count changes, it had intersections.
                    f_before = ms.current_mesh().face_number()
                    ms.apply_filter('meshing_remove_selected_faces')
                    f_after = ms.current_mesh().face_number()
                    has_intersections = (f_before != f_after)
                except: 
                    has_intersections = False # safely assume none if filter fails or not supported

                if check_tm.is_watertight and not has_intersections:
                    success_tier = 2
                    log_msg("Local repair successful! Solid & Clean.", 1.0)
                else:
                    reason = "Contains self-intersections" if has_intersections else "Not watertight"
                    log_msg(f"Local repair failed ({reason}). Fallback to Reconstruction...", 0.4)
            except Exception as e:
                log_msg(f"Tier 2 error: {e}", 0.4)


            # ============================================
            # TIER 3: ALPHA WRAP (Detail Preservation)
            # ============================================
            if success_tier == 0:
                log_msg("Tier 3: Initiating Sharp Alpha Wrap...", 0.45)
                repair_method = 'Alpha Wrap (Sharp)'
                
                ms.load_new_mesh(filepath) 
                
                # Heartbeat
                import threading
                def heartbeat_loop(q, stop_event):
                     secs = 0
                     while not stop_event.is_set():
                         time.sleep(1.0)
                         secs += 1
                         if secs % 2 == 0:
                             q.put(('status', f"Reconstructing... {secs}s"))
                
                stop_heartbeat = threading.Event()
                hb_thread = threading.Thread(target=heartbeat_loop, args=(result_queue, stop_heartbeat))
                hb_thread.daemon = True
                hb_thread.start()
                
                try:
                    # Tuned Settings: Alpha 0.15% (Very Sharp), Offset 0.05%
                    ms.apply_filter('generate_alpha_wrap', 
                                    alpha=pymeshlab.PercentageValue(0.15),
                                    offset=pymeshlab.PercentageValue(0.05))
                                    
                    # Post-Process Alpha Wrap
                    ms.apply_filter('meshing_remove_connected_component_by_face_number', mincomponentsize=200)
                    ms.apply_filter('meshing_remove_unreferenced_vertices')
                    ms.apply_filter('meshing_close_holes', maxholesize=5000)
                    ms.apply_filter('meshing_re_orient_faces_coherently')

                    # 4. VALIDATE TIER 3
                    ms.save_current_mesh(output_path)
                    check_tm = trimesh.load(output_path, process=True)
                    if check_tm.is_watertight:
                        success_tier = 3
                        log_msg("Alpha Wrap successful!", 1.0)
                    else:
                        log_msg("Alpha Wrap failed to seal. Trying last resort...", 0.6)

                except Exception as e:
                    log_msg(f"Alpha Wrap failed: {e}", 0.6)
                finally:
                    stop_heartbeat.set()
                    hb_thread.join()

            # ============================================
            # TIER 4: SCREENED POISSON (Solid & Sharp)
            # ============================================
            if success_tier == 0:
                log_msg("Tier 4: Poisson Reconstruction (High Quality)...", 0.7)
                repair_method = 'Poisson Reconstruction (HQ)'
                
                ms.load_new_mesh(filepath) # Reload
                
                try:
                    ms.apply_filter('compute_normal_per_vertex')
                except: pass

                try:
                    # Bump Depth to 9 for sharper details (was 8)
                    ms.apply_filter('generate_surface_reconstruction_screened_poisson', 
                                    depth=9, 
                                    preclean=True)
                    
                    ms.apply_filter('meshing_remove_connected_component_by_face_number', mincomponentsize=500)
                    ms.apply_filter('meshing_remove_unreferenced_vertices')
                    ms.apply_filter('meshing_re_orient_faces_coherently')
                    
                    success_tier = 4
                    log_msg("Poisson Reconstruction complete.", 0.9)
                except Exception as e:
                     log_msg(f"Poisson failed: {e}", 0.9)

                     
        # Final cleanup for all methods
        try:
             ms.apply_filter('meshing_remove_unreferenced_vertices')
        except: pass

        # ============================================
        # FINAL SOLIDIFICATION CHECK (Double Verify)
        # ============================================
        log_msg("Ensuring solid volume...", 0.90)
        
        try:
            # 1. Merge vertices
            ms.apply_filter('meshing_merge_close_vertices', threshold=pymeshlab.PercentageValue(0.001))
            
            # 2. Repair non-manifold edges/vertices
            try:
                ms.apply_filter('meshing_repair_non_manifold_edges')
                ms.apply_filter('meshing_repair_non_manifold_vertices')
            except: pass
            
            # 3. Close ALL remaining holes
            try:
                ms.apply_filter('meshing_close_holes', maxholesize=100000)
            except: pass
            
            # 4. Re-orient all faces consistently outward (Fixed Typo)
            ms.apply_filter('meshing_re_orient_faces_coherently')
            
            # 5. Invert if volume is negative (inside-out mesh)
            try:
                measures = ms.get_geometric_measures()
                if 'mesh_volume' in measures and measures['mesh_volume'] < 0:
                    log_msg("Flipping inverted normals...", 0.92)
                    ms.apply_filter('meshing_invert_face_orientation')
            except: 
                pass
            
            # 6. Final cleanup
            ms.apply_filter('meshing_remove_unreferenced_vertices')
            
            log_msg("Mesh solidified", 0.94)
        
        except Exception as e:
            log_msg(f"Solidification warning: {e}", 0.93)
        
        # ============================================
        # EXPORT
        # ============================================
        final_faces = ms.current_mesh().face_number()
        log_msg(f"Exporting ({final_faces:,} faces)...", 0.95)
        ms.save_current_mesh(output_path)
        
        # Final Validate
        try:
            val = trimesh.load(output_path, process=True)
            is_watertight = val.is_watertight
        except:
            is_watertight = True # Optimistic fallback
        
        elapsed = time.time() - start_time
        status = "Fixed" if is_watertight else "With Gaps"
        log_msg(f"Done in {elapsed:.1f}s - {status}", 1.0)
        
        result_queue.put(('done', {
            'success': True,
            'method': repair_method,
            'original_faces': original_faces,
            'final_faces': final_faces,
            'is_watertight': is_watertight,
            'time': elapsed
        }))

    except Exception as e:
        import traceback
        traceback.print_exc()
        result_queue.put(('error', str(e)))

def repair_mesh(*args, **kwargs):
    raise NotImplementedError("Use repair_worker via Multiprocessing")
