
import multiprocessing
import time
import os
import sys
from mesh_repair import repair_worker
from multiprocessing import Queue

def run_test():
    # Target File
    # Dynamic paths for portability
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    target_file = os.path.join(base_dir, "temp_uploads", "test_input.stl")
    output_file = os.path.join(base_dir, "fixed_meshes", "test_result.stl")
    
    if not os.path.exists(target_file):
        print(f"CRITICAL: Test file not found: {target_file}")
        sys.exit(1)
        
    print(f"TEST TARGET: {target_file}")
    print(f"SIZE: {os.path.getsize(target_file)/1024/1024:.2f} MB")
    print("TIME LIMIT: 60.0s")
    print("-" * 30)
    
    # Clean previous output
    if os.path.exists(output_file):
        os.remove(output_file)
        
    # Queue for comms
    q = Queue()
    
    # Start Process
    start_time = time.time()
    p = multiprocessing.Process(target=repair_worker, args=(target_file, output_file, q))
    p.start()
    
    # Monitor Loop
    success = False
    details = ""
    
    while True:
        elapsed = time.time() - start_time
        
        # 1. Timeout Check
        if elapsed > 60.0:
            print(f"\n[TIMEOUT] Time elapsed: {elapsed:.2f}s > 60s limit.")
            print("KILLING PROCESS...")
            p.terminate()
            p.join()
            print("TEST FAILED: STRICT TIME LIMIT EXCEEDED")
            sys.exit(1)
            
        # 2. Check Queue
        while not q.empty():
            msg_type, content = q.get()
            if msg_type == 'status':
                print(f"[{elapsed:.1f}s] STATUS: {content}")
            elif msg_type == 'progress':
                text, val = content
                print(f"[{elapsed:.1f}s] PROGRESS {val*100:.0f}%: {text}")
            elif msg_type == 'done':
                success = True
                details = content
                break
            elif msg_type == 'error':
                print(f"\n[ERROR] Worker reported error: {content}")
                p.terminate()
                sys.exit(1)
                
        if success:
            break
            
        if not p.is_alive():
            elapsed = time.time() - start_time
            print(f"\n[CRASH] Process died unexpectedly at {elapsed:.2f}s")
            if p.exitcode != 0:
                print(f"Exit Code: {p.exitcode}")
            sys.exit(1)
            
        time.sleep(0.1)
        
    p.join()
    final_time = time.time() - start_time
    print("-" * 30)
    print(f"TEST COMPLETED in {final_time:.2f}s")
    print(f"Result: {details}")
    
    if final_time <= 60.0:
        print("TEST PASSED ✅")
    else:
        # Should be caught by loop, but just in case
        print("TEST FAILED ❌ (Time Limit)")

if __name__ == "__main__":
    multiprocessing.freeze_support()
    run_test()
