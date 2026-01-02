
import customtkinter as ctk

class FileListItem(ctk.CTkFrame):
    def __init__(self, master, file_data, remove_callback, **kwargs):
        super().__init__(master, **kwargs)
        self.file_data = file_data
        
        # Design
        self.configure(fg_color=("gray90", "gray20"))
        
        # Icon/Checkbox
        self.icon_label = ctk.CTkLabel(self, text="📄", font=("Arial", 16))
        self.icon_label.pack(side="left", padx=10, pady=10)
        
        # Info Frame
        self.info_frame = ctk.CTkFrame(self, fg_color="transparent")
        self.info_frame.pack(side="left", fill="x", expand=True, padx=5)
        
        self.name_label = ctk.CTkLabel(self.info_frame, text=file_data['name'], font=("Arial", 14, "bold"), anchor="w")
        self.name_label.pack(side="top", fill="x")
        
        self.status_label = ctk.CTkLabel(self.info_frame, text=file_data.get('error_count', 'Analyzing...'), 
                                         font=("Arial", 12), text_color=("gray50", "gray70"), anchor="w")
        self.status_label.pack(side="top", fill="x")
        
        # Subprocess Progress Bar
        self.progress_bar = ctk.CTkProgressBar(self, width=150)
        self.progress_bar.pack(side="left", padx=10)
        self.progress_bar.set(0) # Start empty

        self.btn_remove = ctk.CTkButton(self, text="Remove", width=60, fg_color="red", command=lambda: remove_callback(self))
        self.btn_remove.pack(side="right", padx=10)

    def update_status(self, text, color=None, error_tooltip=None):
        self.status_label.configure(text=text)
        if color:
            self.status_label.configure(text_color=color)
            
        if error_tooltip:
            # We could add a tooltip here if CTk supported it easily
            # For now just update text which is visible
            pass
            
    def update_progress(self, value):
        self.progress_bar.set(value)

class DropZone(ctk.CTkFrame):
    def __init__(self, master, drop_callback, **kwargs):
        super().__init__(master, **kwargs)
        self.drop_callback = drop_callback
        
        self.configure(fg_color=("gray85", "gray25"), border_width=2, border_color=("gray70", "gray40"))
        
        self.label = ctk.CTkLabel(self, text="📂 Drag STL files here\nor click to browse", 
                                  font=("Arial", 18))
        self.label.place(relx=0.5, rely=0.5, anchor="center")
        
        # Bind click
        self.bind("<Button-1>", self.on_click)
        self.label.bind("<Button-1>", self.on_click)

    def on_click(self, event):
        # Trigger file dialog
        from customtkinter import filedialog
        files = filedialog.askopenfilenames(filetypes=[("STL Files", "*.stl")])
        if files:
            self.drop_callback(files)
