
import customtkinter as ctk
from tkinterdnd2 import TkinterDnD, DND_FILES
import os
import threading
import time
import traceback
from ui_components import FileListItem, DropZone
from file_handler import FileManager
from mesh_repair import repair_mesh

ctk.set_appearance_mode("System")
ctk.set_default_color_theme("blue")

class App(ctk.CTk, TkinterDnD.DnDWrapper):
    def __init__(self):
        super().__init__()
        self.TkdndVersion = TkinterDnD._require(self)
        
        self.title("STL Mesh Fixer")
        self.geometry("800x600")
        
        self.file_manager = FileManager()
        self.file_items = [] # Store widgets
        
        self.setup_ui()
        
    def setup_ui(self):
        # Grid layout
        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(1, weight=1) # File list expands
        
        # 1. Header & Drop Zone
        self.drop_zone = DropZone(self, drop_callback=self.on_drop_files)
        self.drop_zone.grid(row=0, column=0, padx=20, pady=20, sticky="ew")
        self.drop_zone.configure(height=120)
        
        # Enable Drag and Drop on the drop zone
        # Note: In TkinterDnD, we usually register the widget
        self.drop_zone.drop_target_register(DND_FILES)
        self.drop_zone.dnd_bind('<<Drop>>', self.on_drop_event)
        
        # 2. File List
        self.file_list_frame = ctk.CTkScrollableFrame(self, label_text="Loaded Files")
        self.file_list_frame.grid(row=1, column=0, padx=20, pady=(0, 20), sticky="nsew")
        
        # 3. Settings & Controls
        self.controls_frame = ctk.CTkFrame(self)
        self.controls_frame.grid(row=2, column=0, padx=20, pady=20, sticky="ew")
        
        # Settings
        self.save_same_folder = ctk.BooleanVar(value=True)
        self.suffix_var = ctk.BooleanVar(value=True)
        
        self.chk_save = ctk.CTkCheckBox(self.controls_frame, text="Save to same folder", variable=self.save_same_folder)
        self.chk_save.pack(side="left", padx=20, pady=20)
        
        self.chk_suffix = ctk.CTkCheckBox(self.controls_frame, text="Add '_fixed' suffix", variable=self.suffix_var)
        self.chk_suffix.pack(side="left", padx=20, pady=20)
        
        # Buttons
        self.btn_repair = ctk.CTkButton(self.controls_frame, text="Repair All", command=self.start_repair)
        self.btn_repair.pack(side="right", padx=20, pady=20)
        
        self.btn_clear = ctk.CTkButton(self.controls_frame, text="Clear List", fg_color="gray", command=self.clear_list)
        self.btn_clear.pack(side="right", padx=0, pady=20)
        
        # Progress
        self.progress_bar = ctk.CTkProgressBar(self)
        self.progress_bar.grid(row=3, column=0, padx=20, pady=(0, 20), sticky="ew")
        self.progress_bar.set(0)

    def on_drop_event(self, event):
        files = self.tk.splitlist(event.data)
        self.on_drop_files(files)

    def on_drop_files(self, files):
        for f in files:
            file_data = self.file_manager.add_file(f)
            if file_data:
                self.add_file_item(file_data)
                
    def add_file_item(self, file_data):
        item = FileListItem(self.file_list_frame, file_data, self.remove_file_item)
        item.pack(fill="x", padx=5, pady=5)
        self.file_items.append(item)
        
        # Analyze in background
        self.file_manager.analyze_file(file_data, callback=lambda d, w=item: self.update_item_status(d, w))

    def update_item_status(self, file_data, widget):
        # Need to run in main thread
        self.after(0, lambda: widget.update_status(file_data['error_count']))

    def remove_file_item(self, widget):
        if widget in self.file_items:
            idx = self.file_items.index(widget)
            self.file_manager.remove_file(idx)
            widget.destroy()
            self.file_items.pop(idx)

    def clear_list(self):
        self.file_manager.clear()
        for widget in self.file_items:
            widget.destroy()
        self.file_items = []

    def start_repair(self):
        if not self.file_manager.files:
            return
        
        self.btn_repair.configure(state="disabled")
        self.progress_bar.set(0)
        
        threading.Thread(target=self.run_repair_process).start()
        
    def run_repair_process(self):
        """
        Multiprocessing Subprocess Manager.
        Handles Watchdog, Progress Bars, and Sequential Execution.
        """
        import time
        from multiprocessing import Process, Queue
        from mesh_repair import repair_worker
        import threading # Keep for legacy if needed, but we use Process

        # We must run this Manager logic in a Thread so we don't block the UI
        # while waiting for the Subprocess
        def manager_thread():
            total_files = len(self.file_manager.files)
            
            # Disable button during run
            self.after(0, lambda: self.btn_repair.configure(state="disabled"))
            
            for file_index in range(total_files):
                file_data = self.file_manager.files[file_index]
                
                # Determine paths
                input_path = file_data['path']
                dir_name = os.path.dirname(input_path)
                base_name = os.path.basename(input_path)
                name, ext = os.path.splitext(base_name)
                
                # Access UI var from main thread? CTk vars are usually thread safe-ish
                # but better to get them via after or assume simple reads work
                suffix = "_fixed" if self.suffix_var.get() else ""
                
                # Assuming self.chk_overwrite is a CTkCheckBox with a BooleanVar
                # This line was missing in the original context, adding a placeholder for now
                # If it's not defined, it will cause an error.
                # For now, let's assume save_same_folder controls overwrite behavior
                if self.save_same_folder.get(): # Using save_same_folder as a proxy for overwrite
                    out_path = os.path.join(dir_name, f"{name}{suffix}{ext}")
                else:
                    out_folder = os.path.join(dir_name, "fixed_meshes")
                    os.makedirs(out_folder, exist_ok=True)
                    out_path = os.path.join(out_folder, f"{name}{suffix}{ext}")

                # UI Setup for this file
                file_item = self.file_items[file_index]
                self.after(0, lambda fi=file_item: fi.update_status("Starting Subprocess...", "orange"))
                self.after(0, lambda fi=file_item: fi.update_progress(0.0))
                
                # Create Queue and Process
                q = Queue()
                p = Process(target=repair_worker, args=(input_path, out_path, q))
                p.start()
                
                # Watchdog State
                start_time = time.time()
                last_heartbeat = time.time()
                current_status_text = "Initializing..."
                file_done = False
                
                while p.is_alive() and not file_done:
                    # 1. READ QUEUE
                    while not q.empty():
                        try:
                            msg_type, content = q.get_nowait()
                            last_heartbeat = time.time() # Reset Watchdog
                            
                            if msg_type == 'status':
                                current_status_text = content
                                self.after(0, lambda fi=file_item, c=content: fi.update_status(c, "#64C8FF"))
                            elif msg_type == 'progress':
                                text, val = content
                                current_status_text = text
                                file_item._last_progress = val  # Store for ETA calc
                                self.after(0, lambda fi=file_item, t=text: fi.update_status(t, "#64C8FF"))
                                self.after(0, lambda fi=file_item, v=val: fi.update_progress(v))
                                # Global bar
                                global_base = file_index / total_files
                                global_val = global_base + (val / total_files)
                                self.after(0, lambda g=global_val: self.progress_bar.set(g))
                            elif msg_type == 'done':
                                self.after(0, lambda fi=file_item: fi.update_status("Fixed! (Sharper) ✓", "#00E676"))
                                self.after(0, lambda fi=file_item: fi.update_progress(1.0))
                                file_done = True
                            elif msg_type == 'error':
                                self.after(0, lambda fi=file_item, c=content: fi.update_status("Error ❌", "#FF5252", c)) # Red
                                print(f"Subprocess Error: {content}")
                                file_done = True
                        except:
                            break
                    
                    # 2. WATCHDOG & LIVE TIMER WITH ETA
                    elapsed_total = time.time() - start_time
                    hang_time = time.time() - last_heartbeat
                    
                    if not file_done:
                        # Calculate ETA based on progress
                        # Get current progress from file_item's progress bar
                        # We track it via the last 'progress' message val
                        current_prog = getattr(file_item, '_last_progress', 0.1) or 0.1
                        
                        if current_prog > 0.01:
                            estimated_total = elapsed_total / current_prog
                            remaining = max(0, estimated_total - elapsed_total)
                            eta_str = f"~{remaining:.0f}s left"
                        else:
                            eta_str = "calculating..."
                        
                        timer_msg = f"{current_status_text} ({elapsed_total:.0f}s / {eta_str})"
                        self.after(0, lambda fi=file_item, t=timer_msg: fi.update_status(t, "#64C8FF"))
                    
                    if hang_time > 300: # 5 Minute Timeout (max)
                         print(f"Watchdog detecting hang on {base_name}...")
                         self.after(0, lambda fi=file_item: fi.update_status("HUNG - KILLING...", "#FF5252"))
                         p.terminate()
                         p.join()
                         self.after(0, lambda fi=file_item: fi.update_status("Failed (Hang) ❌", "#FF5252"))
                         file_done = True
                    
                    time.sleep(0.1)
                
                p.join()
                
                # Ensure 100% on global if not done
                self.after(0, lambda p=(file_index+1)/total_files: self.progress_bar.set(p))

            # All Done
            self.after(0, lambda: self.btn_repair.configure(state="normal"))

        # Run the manager in a thread so GUI doesn't freeze
        import threading
        threading.Thread(target=manager_thread).start()

if __name__ == "__main__":
    # Windows Multiprocessing Support
    from multiprocessing import freeze_support
    freeze_support()
    
    app = App()
    app.mainloop()
