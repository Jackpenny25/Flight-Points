// Note: Rely on lib.dom types for File System Access API when available.
// In environments where these are missing, the code uses runtime feature detection.

interface StoredFileMetadata {
  id: string;
  name: string;
  type: string;
  size: number;
  lastModified: number;
  createdAt: string;
  metadata?: Record<string, any>;
  path?: string;
}

// Check if the File System Access API is available
const isFileSystemAccessAPIAvailable = 
  typeof window !== 'undefined' && 
  (window.showSaveFilePicker !== undefined) && 
  (window.showOpenFilePicker !== undefined);

export const FileStorage = {
  // Check if File System Access API is available
  isFileSystemAccessAPIAvailable(): boolean {
    return isFileSystemAccessAPIAvailable;
  },

  // Store a file on the local file system
  async uploadFile(file: File, metadata: Record<string, any> = {}): Promise<string> {
    try {
      if (!isFileSystemAccessAPIAvailable) {
        throw new Error('File System Access API is not available in this browser');
      }

      // Ensure we're in a secure context (HTTPS or localhost)
      if (window.isSecureContext === false) {
        throw new Error('File System Access requires a secure context (HTTPS or localhost)');
      }

      // Create options for the file picker
      const options = {
        suggestedName: file.name,
        types: [{
          description: 'RAF Cadet Files',
          accept: { [file.type]: [`.${file.name.split('.').pop() || ''}`] },
        }],
      };

      // Show the file picker dialog
      let fileHandle;
      try {
        fileHandle = await window.showSaveFilePicker(options);
      } catch (error) {
        const err = error as Error & { name: string };
        if (err.name === 'AbortError') {
          throw new Error('File save was cancelled');
        }
        throw error;
      }
      
      // Create a writable stream and write the file
      const writable = await fileHandle.createWritable();
      await writable.write(file);
      await writable.close();
      
      // Store metadata in localStorage
      const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const fileMetadata: StoredFileMetadata = {
        id: fileId,
        name: fileHandle.name,
        type: file.type,
        size: file.size,
        lastModified: (file as any).lastModified ?? Date.now(),
        path: fileHandle.name, // Note: Actual path isn't accessible due to security restrictions
        createdAt: new Date().toISOString(),
        metadata
      };
      
      // Update file index
      const fileIndex = JSON.parse(localStorage.getItem('fileIndex') || '[]');
      fileIndex.push(fileId);
      localStorage.setItem(`file_${fileId}`, JSON.stringify(fileMetadata));
      localStorage.setItem('fileIndex', JSON.stringify(fileIndex));
      
      return fileId;
    } catch (error) {
      console.error('Error saving file:', error);
      throw new Error('Failed to save file to local file system');
    }
  },

  // Get file metadata
  async getFileMetadata(fileId: string): Promise<StoredFileMetadata | null> {
    const fileData = localStorage.getItem(`file_${fileId}`);
    if (!fileData) return null;
    return JSON.parse(fileData);
  },

  // Get file as a Blob by prompting the user to select it
  async getFileAsBlob(fileId: string): Promise<Blob | null> {
    const metadata = await this.getFileMetadata(fileId);
    if (!metadata) return null;
    
    try {
      if (!isFileSystemAccessAPIAvailable) {
        throw new Error('File System Access API is not available in this browser');
      }

      // Ensure we're in a secure context
      if (window.isSecureContext === false) {
        throw new Error('File System Access requires a secure context (HTTPS or localhost)');
      }

      // Create options for the file picker
      const options = {
        multiple: false,
        types: [{
          description: 'RAF Cadet Files',
          accept: { [metadata.type]: [`.${metadata.name.split('.').pop() || ''}`] },
        }],
      };

      // Show the file picker dialog
      let fileHandles;
      try {
        fileHandles = await window.showOpenFilePicker(options);
      } catch (error) {
        const err = error as Error & { name: string };
        if (err.name === 'AbortError') {
          throw new Error('File selection was cancelled');
        }
        throw error;
      }

      if (!fileHandles || fileHandles.length === 0) {
        throw new Error('No file selected');
      }
      
      const file = await fileHandles[0].getFile();
      return file;
    } catch (error) {
      console.error('Error reading file:', error);
      return null;
    }
  },

  // Get file as a data URL
  async getFileAsDataUrl(fileId: string): Promise<string | null> {
    const file = await this.getFileAsBlob(fileId);
    if (!file) return null;
    
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.readAsDataURL(file);
    });
  },

  // Get a file (compatibility method)
  async getFile(fileId: string): Promise<{ id: string; name: string; type: string; size: number; data: string } | null> {
    const metadata = await this.getFileMetadata(fileId);
    if (!metadata) return null;
    
    const file = await this.getFileAsBlob(fileId);
    if (!file) return null;
    
    const dataUrl = await this.getFileAsDataUrl(fileId);
    if (!dataUrl) return null;
    
    return {
      id: metadata.id,
      name: metadata.name,
      type: metadata.type,
      size: metadata.size,
      data: dataUrl.split(',')[1] // Remove data URL prefix
    };
  },

  // List all stored files
  listFiles(): string[] {
    return JSON.parse(localStorage.getItem('fileIndex') || '[]');
  },

  // Delete a file (only removes from index, can't delete actual file due to security restrictions)
  deleteFile(fileId: string): void {
    // Note: We can't delete the actual file due to security restrictions
    // We can only remove the reference from our index
    localStorage.removeItem(`file_${fileId}`);
    const fileIndex = JSON.parse(localStorage.getItem('fileIndex') || '[]');
    const newIndex = fileIndex.filter((id: string) => id !== fileId);
    localStorage.setItem('fileIndex', JSON.stringify(newIndex));
    
    console.warn('File reference removed from index, but the actual file remains on disk.');
  },

  // Clear all files (for testing/cleanup)
  clearAllFiles(): void {
    const fileIndex = this.listFiles();
    fileIndex.forEach(fileId => {
      localStorage.removeItem(`file_${fileId}`);
    });
    localStorage.removeItem('fileIndex');
    console.warn('File references cleared, but actual files remain on disk.');
  },
  
  // Get the file system handle for a file (if available)
  async getFileHandle(fileId: string): Promise<any | null> {
    if (!isFileSystemAccessAPIAvailable) return null;
    
    try {
      const fileHandles = await window.showOpenFilePicker?.({
        multiple: false
      });
      
      return fileHandles?.[0] || null;
    } catch (error) {
      console.error('Error getting file handle:', error);
      return null;
    }
  }
};
