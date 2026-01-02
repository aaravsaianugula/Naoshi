
import os
from mesh_repair import analyze_stl, repair_mesh
import threading

class FileManager:
    def __init__(self):
        self.files = [] # List of dicts {path, stats, status, output_path}
        self.processing = False
        
    def add_file(self, filepath):
        if not filepath.lower().endswith('.stl'):
            return None
            
        file_data = {
            'path': filepath,
            'name': os.path.basename(filepath),
            'stats': None,
            'status': 'Pending',
            'output_path': None,
            'log': [],
            'error_count': '...'
        }
        
        self.files.append(file_data)
        return file_data

    def analyze_file(self, file_data, callback=None):
        def _run():
            try:
                stats = analyze_stl(file_data['path'])
                file_data['stats'] = stats
                
                # Check specifics
                if 'error' in stats:
                    file_data['error_count'] = "Error reading file"
                else:
                    err_count = 0
                    if not stats.get('is_watertight'):
                         err_count += 1
                         # Improve error counting visualization
                    
                    # Store display string
                    if stats.get('is_watertight'):
                        file_data['error_count'] = "0 errors (Watertight)"
                    else:
                        file_data['error_count'] = "Non-watertight (Needs Repair)"
                        
            except Exception as e:
                file_data['error_count'] = "Error"
                
            if callback:
                callback(file_data)
                
        threading.Thread(target=_run).start()

    def remove_file(self, index):
        if 0 <= index < len(self.files):
            self.files.pop(index)

    def clear(self):
        self.files = []
