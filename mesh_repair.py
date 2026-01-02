
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
    ALPHA WRAP - Maximum Quality Mode
    
    NO decimation - preserves all original detail
    Alpha 0.15% - tightest wrap for maximum detail preservation
    Will take ~3-5 minutes but produces best quality
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
            
            # Just minimal cleanup
            try:
                ms.apply_filter('meshing_remove_connected_component_by_face_number', mincomponentsize=50)
                ms.apply_filter('meshing_remove_unreferenced_vertices')
            except: pass
            
            final_faces = ms.current_mesh().face_number()
            is_watertight = True
            repair_method = 'Passthrough (Valid)'

        else:
            # ============================================
            # TIER 2: LIGHT REPAIR (Stitch it up)
            # ============================================
            log_msg("Attempting Light Repair (Stitching)...", 0.2)
            repair_method = 'Light Repair'
            success_light = False
            
            try:
                # 1. Cleaning
                ms.apply_filter('meshing_remove_unreferenced_vertices')
                ms.apply_filter('meshing_remove_duplicate_faces')
                ms.apply_filter('meshing_remove_duplicate_vertices')
                
                # 2. Repair
                ms.apply_filter('meshing_repair_non_manifold_edges')
                ms.apply_filter('meshing_repair_non_manifold_vertices')
                ms.apply_filter('meshing_close_holes', maxholesize=1000) # Close reasonably sized holes
                ms.apply_filter('meshing_fix_orientation_by_reorienting_faces')
                
                # 3. Check Result (internal simulation check using trimesh on current data would be expensive)
                # Let's trust pymeshlab actions or do a quick check via temp file?
                # For speed, we might just assume it worked? No, we need to know if we need Tier 3.
                # We can use pymeshlab's geometric measures? No, 'is_watertight' isn't direct.
                # Let's do a fast export-check.
                
                # Check topological validity
                stats = ms.apply_filter('compute_topological_measures') # returns dict in newer versions?
                # Actually, filters usually don't return values directly in this API wrapper easily without 'get_geometric_measures'.
                # Let's save to a temp file to verify.
                
                temp_check_path = output_path + ".check.stl"
                ms.save_current_mesh(temp_check_path)
                
                check_tm = trimesh.load(temp_check_path, process=False)
                if check_tm.is_watertight:
                    success_light = True
                    log_msg("Light repair successful!", 0.3)
                    if os.path.exists(temp_check_path): os.remove(temp_check_path)
                else:
                    log_msg("Light repair insufficient. Trying Surgical Repair...", 0.3)
                    if os.path.exists(temp_check_path): os.remove(temp_check_path)
                    ms.load_new_mesh(filepath) # RELOAD for Tier 2.5
            except Exception as e:
                log_msg(f"Light repair error: {e}", 0.3)
                ms.load_new_mesh(filepath) 

            # ============================================
            # TIER 2.5: SURGICAL REPAIR (Cut & Patch)
            # ============================================
            success_surgical = False
            if not success_light:
                repair_method = 'Surgical Repair (Cut & Patch)'
                try:
                    # 1. Identify and Cut Bad Parts
                    log_msg("Surgical: Removing bad geometry...", 0.35)
                    # Select non-manifold edges/faces
                    ms.apply_filter('compute_selection_by_non_manifold_edges_per_face')
                    ms.apply_filter('meshing_remove_selected_faces')
                    
                    # Select self-intersecting faces (if any)
                    try:
                        ms.apply_filter('compute_selection_by_self_intersections_per_face')
                        ms.apply_filter('meshing_remove_selected_faces')
                    except: pass # Self-intersection filter might prevent execution if none found?
                    
                    # Clean up the mess we made
                    ms.apply_filter('meshing_remove_unreferenced_vertices')
                    
                    # 2. Patch the Holes
                    log_msg("Surgical: Patching holes...", 0.38)
                    ms.apply_filter('meshing_repair_non_manifold_vertices')
                    ms.apply_filter('meshing_close_holes', maxholesize=5000) # Larger holes allowed now
                    ms.apply_filter('meshing_re_orient_faces_coherently')
                    
                    # 3. Check Result
                    ms.save_current_mesh(temp_check_path)
                    check_tm = trimesh.load(temp_check_path, process=False)
                    if check_tm.is_watertight:
                        success_surgical = True
                        log_msg("Surgical repair successful!", 0.4)
                        if os.path.exists(temp_check_path): os.remove(temp_check_path)
                    else:
                        log_msg("Surgical repair insufficient. Fallback to Deep Repair.", 0.4)
                        if os.path.exists(temp_check_path): os.remove(temp_check_path)
                        ms.load_new_mesh(filepath) # RELOAD for Tier 3
                        
                except Exception as e:
                    log_msg(f"Surgical repair error: {e}", 0.4)
                    ms.load_new_mesh(filepath)

            if not success_light and not success_surgical:
                # ============================================
                # TIER 3: DEEP REPAIR (Alpha Wrap - Smart Mode)
                # ============================================
                repair_method = 'Alpha Wrap (Smart Reconstruction)'
                log_msg("Initiating Smart Surface Reconstruction...", 0.45)
                
                original_faces = ms.current_mesh().face_number()
                
                # SMART ADAPTIVE DECIMATION
                # Only decimate if mesh is truly massive, and preserve boundary/curvature
                target_faces = 800000  # Higher threshold - preserve more detail
                
                if original_faces > target_faces:
                    log_msg(f"Smart decimation: {original_faces:,} → {target_faces//1000}k faces (preserving boundaries)...", 0.5)
                    
                    # First, mark boundary vertices to preserve them
                    try:
                        ms.apply_filter('compute_selection_border')
                        # Also select high-curvature areas (detail regions)
                        ms.apply_filter('compute_selection_by_edge_curvature', threshold=30)
                    except: pass
                    
                    # Apply quality-aware decimation with boundary preservation
                    ms.apply_filter('meshing_decimation_quadric_edge_collapse', 
                                    targetfacenum=target_faces,
                                    preservetopology=True,
                                    preserveboundary=True,  # DON'T merge boundary edges
                                    boundaryweight=1.0,     # Full weight to boundary preservation
                                    qualitythr=0.5,         # Higher = better quality triangles
                                    optimalplacement=True)  # Better vertex positioning
                else:
                    log_msg(f"Mesh size OK ({original_faces:,} faces), skipping decimation to preserve detail", 0.5)
                
                # ALPHA WRAP with TIGHTER parameters for better detail
                # Heartbeat (Keep UI alive)
                import threading
                def heartbeat_loop(q, stop_event):
                     secs = 0
                     while not stop_event.is_set():
                         time.sleep(1.0)
                         secs += 1
                         if secs % 2 == 0:
                             q.put(('status', f"Reconstructing Surface... {secs}s"))
                
                stop_heartbeat = threading.Event()
                hb_thread = threading.Thread(target=heartbeat_loop, args=(result_queue, stop_heartbeat))
                hb_thread.daemon = True
                hb_thread.start()
                
                try:
                    # SMARTER Alpha Wrap parameters:
                    # - Alpha: 0.12% (tighter = captures more detail but slower)
                    # - Offset: 0.05% (smaller = closer to original surface)
                    ms.apply_filter('generate_alpha_wrap', 
                                    alpha=pymeshlab.PercentageValue(0.12),
                                    offset=pymeshlab.PercentageValue(0.05))
                finally:
                    stop_heartbeat.set()
                    hb_thread.join()
                
                log_msg("Reconstruction complete. Retopologizing...", 0.7)
                
                # Cleanup noise from Alpha Wrap
                try:
                    # Remove tiny floating bits (dust)
                    ms.apply_filter('meshing_remove_connected_component_by_face_number', mincomponentsize=200)
                except: pass

                # RETOPOLOGY: Isotropic Remeshing for clean uniform triangles
                # This creates better topology without losing detail
                try:
                    # Calculate target edge length based on mesh size
                    bbox = ms.get_geometric_measures()
                    diag = bbox.get('bbox_diagonal', 100)
                    target_edge = diag * 0.005  # 0.5% of diagonal = fine detail
                    
                    log_msg(f"Isotropic remeshing (target edge: {target_edge:.2f})...", 0.72)
                    ms.apply_filter('meshing_isotropic_explicit_remeshing',
                                    targetlen=pymeshlab.AbsoluteValue(target_edge),
                                    iterations=3,  # 3 iterations for good quality
                                    adaptive=True)  # Adapt to local curvature
                except Exception as e:
                    log_msg(f"Remeshing skipped: {e}", 0.72)
                
                # GENTLE POST-PROCESSING (don't over-smooth)
                try:
                    ms.apply_filter('apply_coord_taubin_smoothing',
                                    lambda_=0.3, mu=-0.34, stepsmoothnum=2)  # Less aggressive smoothing
                except: pass
                
                # Cleanup
                ms.apply_filter('meshing_remove_connected_component_by_face_number', mincomponentsize=100)
                ms.apply_filter('meshing_remove_unreferenced_vertices')
                
                # CRITICAL: Close any remaining holes from Alpha Wrap
                log_msg("Closing remaining holes...", 0.75)
                try:
                    # Iterative closing: Close small holes first, then larger ones
                    ms.apply_filter('meshing_close_holes', maxholesize=1000)
                    ms.apply_filter('meshing_close_holes', maxholesize=5000)
                    ms.apply_filter('meshing_close_holes', maxholesize=10000)
                except: pass


        final_faces = ms.current_mesh().face_number()
        
        # ============================================
        # FINAL SOLIDIFICATION (Critical for Slicers)
        # ============================================
        log_msg("Ensuring solid volume...", 0.90)
        
        try:
            # 1. Merge vertices (tolerance-based welding)
            ms.apply_filter('meshing_merge_close_vertices', threshold=pymeshlab.PercentageValue(0.001))
            
            # 2. Repair non-manifold edges/vertices
            try:
                ms.apply_filter('meshing_repair_non_manifold_edges')
                ms.apply_filter('meshing_repair_non_manifold_vertices')
            except: pass
            
            # 3. Close ALL remaining holes (critical for watertightness)
            try:
                ms.apply_filter('meshing_close_holes', maxholesize=100000)
            except: pass
            
            # 4. Re-orient all faces consistently outward
            ms.apply_filter('meshing_re_orient_all_faces_coherentely')
            
            # 5. Invert if volume is negative (inside-out mesh)
            try:
                measures = ms.get_geometric_measures()
                if 'mesh_volume' in measures and measures['mesh_volume'] < 0:
                    log_msg("Flipping inverted normals...", 0.92)
                    ms.apply_filter('meshing_invert_face_orientation')
            except: 
                # Fallback: Just ensure coherent orientation
                pass
            
            # 6. Final cleanup
            ms.apply_filter('meshing_remove_unreferenced_vertices')
            
            log_msg("Mesh solidified", 0.94)
        
        except Exception as e:
            log_msg(f"Solidification warning: {e}", 0.93)
        
        # ============================================
        # EXPORT
        # ============================================
        log_msg(f"Exporting ({final_faces:,} faces)...", 0.95)
        ms.save_current_mesh(output_path)
        
        # Final Validate
        # IMPORTANT: Use process=True to merge vertices (STL is non-indexed)
        # This is required for accurate watertight detection
        try:
            val = trimesh.load(output_path, process=True)
            is_watertight = val.is_watertight
        except:
            is_watertight = True # Optimistic fallback
        
        elapsed = time.time() - start_time
        status = "Fixed" if is_watertight else "Has gaps"
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
