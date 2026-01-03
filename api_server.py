import os
import shutil
import uuid
import asyncio
import glob
from typing import List, Dict, Optional, Union
from fastapi import FastAPI, UploadFile, File, WebSocket, BackgroundTasks, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
import uvicorn
from contextlib import asynccontextmanager

# Import existing backend logic
try:
    from mesh_repair import repair_worker
    import simple_pid 
except ImportError:
    pass

from multiprocessing import Process, Queue
import queue # for queue.Empty exception
from pydantic import BaseModel

# Store active repair jobs
# job_id -> { 'status': '...', 'progress': 0, 'result': None, 'process': Process, 'queue': Queue }
active_jobs: Dict[str, dict] = {}

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "web")
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "temp_uploads")
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "fixed_meshes")

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("Starting Mesher API Server...")
    
    # Clean temp folder on start
    print(f"Cleaning temp folder: {UPLOAD_DIR}")
    try:
        for f in os.listdir(UPLOAD_DIR):
            fp = os.path.join(UPLOAD_DIR, f)
            if os.path.isfile(fp):
                os.remove(fp)
    except Exception as e:
        print(f"Error cleaning temp folder: {e}")

    yield
    # Shutdown: Clean up processes
    for job_id, job in active_jobs.items():
        if job['process'].is_alive():
            job['process'].terminate()
    print("Shutting down...")

app = FastAPI(lifespan=lifespan)

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    print(f"Validation Error: {exc}")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body": exc.body},
    )

# CORS for dev (if running vite separately)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- MODELS ---
class RepairRequest(BaseModel):
    transform: Optional[Union[List[List[float]], List[float]]] = None # 4x4 matrix or flat 16-float list

# --- ENDPOINTS ---

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    # 1. Validate Extension
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ['.stl', '.obj']:
        raise HTTPException(status_code=400, detail="Invalid file type. Only .stl and .obj supported.")

    # 2. Validate Size & Save (Stream to avoid memory issues, limit 100MB)
    MAX_SIZE = 100 * 1024 * 1024
    file_id = str(uuid.uuid4())
    safe_name = f"{file_id}{ext}"
    file_path = os.path.join(UPLOAD_DIR, safe_name)
    
    try:
        size = 0
        with open(file_path, "wb") as buffer:
            while chunk := await file.read(1024 * 1024): # 1MB chunks
                size += len(chunk)
                if size > MAX_SIZE:
                    buffer.close()
                    os.remove(file_path)
                    raise HTTPException(status_code=413, detail="File too large (Max 100MB)")
                buffer.write(chunk)
    except Exception as e:
         if os.path.exists(file_path): os.remove(file_path)
         raise e

    return {"id": file_id, "filename": file.filename, "path": file_path}

@app.post("/api/auto_orient/{file_id}")
async def auto_orient_file(file_id: str):
    files = glob.glob(os.path.join(UPLOAD_DIR, f"{file_id}*"))
    if not files:
        raise HTTPException(status_code=404, detail="File not found")
    
    input_path = files[0]
    
    # Run calculation in thread pool to avoid blocking async loop
    loop = asyncio.get_event_loop()
    try:
        from calculate_orientation import get_best_orientation
        print(f"Calculating orientation for {input_path}")
        transform = await loop.run_in_executor(None, get_best_orientation, input_path)
    except Exception as e:
         print(f"Orientation error: {e}")
         # Return identity if failure
         transform = [[1.0,0.0,0.0,0.0],[0.0,1.0,0.0,0.0],[0.0,0.0,1.0,0.0],[0.0,0.0,0.0,1.0]]

    print(f"Calculated transform: {transform}")
    
    return {"transform": transform}

@app.post("/api/validate_mesh")
async def validate_mesh(file: UploadFile = File(...)):
    import trimesh
    import numpy as np

    file_id = str(uuid.uuid4())
    temp_path = os.path.join(UPLOAD_DIR, f"validate_{file_id}.stl")
    
    try:
        with open(temp_path, "wb") as buffer:
             shutil.copyfileobj(file.file, buffer)

        def validate_worker(path):
            try:
                # process=True merges vertices which is needed for water tightness check on STL
                mesh = trimesh.load(path, process=True) 
                return {
                    "valid": bool(mesh.is_watertight),
                    "details": {
                        "watertight": bool(mesh.is_watertight),
                        "winding_consistent": bool(mesh.is_winding_consistent),
                        "euler_number": int(mesh.euler_number),
                        "volume": float(mesh.volume),
                        "vertices": len(mesh.vertices),
                        "faces": len(mesh.faces)
                    }
                }
            except Exception as e:
                return {"error": str(e)}

        # Run in thread pool
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, validate_worker, temp_path)
        
        if "error" in result:
             return JSONResponse(status_code=500, content=result)
        
        return result
        
    except Exception as e:
        print(f"Validation error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

@app.post("/api/repair/{file_id}")
async def start_repair(file_id: str, request: RepairRequest = None, background_tasks: BackgroundTasks = None):
    # Find file
    files = glob.glob(os.path.join(UPLOAD_DIR, f"{file_id}*"))
    if not files:
        raise HTTPException(status_code=404, detail="File not found")
    
    input_path = files[0]
    filename = os.path.basename(input_path)
    output_filename = f"fixed_{filename}"
    output_path = os.path.join(OUTPUT_DIR, output_filename)
    
    transform = request.transform if request else None

    # Handle Transform & Create Final Input
    final_input_path = input_path
    cleanup_path = None # File to delete after job
    
    if transform:
        import trimesh
        import numpy as np
        try:
            mesh = trimesh.load(input_path, process=False)
            
            # Handle Transform Format
            matrix = np.array(transform)
            
            # Case: Flat Array (16,) -> Reshape 4x4 -> Transpose (Col-Major to Row-Major)
            if matrix.shape == (16,):
                matrix = matrix.reshape((4, 4)).T
                
            elif matrix.shape != (4, 4):
                 print(f"Invalid matrix shape: {matrix.shape}")
                 matrix = np.eye(4)

            mesh.apply_transform(matrix)
            
            # Save to a new temp path
            oriented_filename = f"oriented_{filename}"
            final_input_path = os.path.join(UPLOAD_DIR, oriented_filename)
            mesh.export(final_input_path)
            cleanup_path = final_input_path
        except Exception as e:
            print(f"Error applying transform: {e}")
            final_input_path = input_path

    # Launch Process
    q = Queue()
    p = Process(target=repair_worker, args=(final_input_path, output_path, q))
    p.start()
    
    active_jobs[file_id] = {
        'status': 'starting',
        'progress': 0,
        'process': p,
        'queue': q,
        'output_path': output_path,
        'filename': filename,
        'cleanup_path': cleanup_path
    }
    
    return {"status": "started", "job_id": file_id}

@app.websocket("/ws/progress/{file_id}")
async def websocket_endpoint(websocket: WebSocket, file_id: str):
    await websocket.accept()
    
    if file_id not in active_jobs:
        await websocket.send_json({'type': 'error', 'message': 'Job not found'})
        await websocket.close()
        return

    job = active_jobs[file_id]
    q = job['queue']
    p = job['process']
    
    try:
        while True:
            try:
                # Drain queue
                while not q.empty():
                    msg_type, content = q.get_nowait()
                    
                    if msg_type == 'progress':
                        text, val = content
                        job['progress'] = val
                        await websocket.send_json({'type': 'progress', 'text': text, 'value': val})
                    
                    elif msg_type == 'status':
                        await websocket.send_json({'type': 'status', 'text': content})
                        
                    elif msg_type == 'done':
                        job['status'] = 'done'
                        await websocket.send_json({'type': 'done', 'result': content})
                        
                    elif msg_type == 'error':
                        job['status'] = 'error'
                        await websocket.send_json({'type': 'error', 'message': content})
            except queue.Empty:
                pass
            except Exception as e:
                print(f"Queue error: {e}")
                break
            
            # Check liveness
            if not p.is_alive() and job['status'] not in ['done', 'error']:
                 # If process died without sending 'done' or 'error', assume crash
                 job['status'] = 'error'
                 await websocket.send_json({'type': 'error', 'message': 'Process terminated unexpectedly'})

            if job.get('status') in ['done', 'error']:
                break
                
            await asyncio.sleep(0.1)
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        # Cleanup temporary files (oriented input)
        if job.get('cleanup_path') and os.path.exists(job['cleanup_path']):
            try:
                os.remove(job['cleanup_path'])
                print(f"Cleaned up temp file: {job['cleanup_path']}")
            except: pass



@app.get("/api/download/{file_id}")
async def download_fixed(file_id: str):
    if file_id not in active_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
        
    job = active_jobs[file_id]
    if job['status'] != 'done':
        raise HTTPException(status_code=400, detail="Repair not finished")
        
    return FileResponse(job['output_path'], filename=f"fixed_{job['filename']}")

# Mount Frontend (Last route)
if os.path.exists(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="static")

# ... existing code ...

def find_free_port(start_port=8000):
    """Finds the first available port starting from start_port."""
    port = start_port
    while port < 65535:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("0.0.0.0", port))
                return port
            except OSError:
                port += 1
    raise IOError("No free ports found")

if __name__ == "__main__":
    import socket
    import webbrowser
    import threading

    # 1. Find a free port
    try:
        port = find_free_port(8000)
    except Exception as e:
        print(f"Error finding port: {e}")
        port = 8000

    # 2. Open browser after a short delay (to let server start)
    def open_browser():
        url = f"http://localhost:{port}"
        print(f"Opening browser at {url}")
        webbrowser.open(url)

    threading.Timer(1.5, open_browser).start()

    # 3. Start Server
    print(f"Starting server on port {port}...")
    uvicorn.run(app, host="0.0.0.0", port=port)
