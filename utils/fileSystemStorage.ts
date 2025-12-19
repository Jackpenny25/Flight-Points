// Type declarations for File System Access API
declare global {
  interface Window {
    showSaveFilePicker?: (options?: {
      suggestedName?: string;
      types?: Array<{
        description?: string;
        accept: Record<string, string[]>;
      }>;
    }) => Promise<FileSystemFileHandle>;
    showOpenFilePicker?: (options?: {
      multiple?: boolean;
      types?: Array<{
        description?: string;
        accept: Record<string, string[]>;
      }>;
    }) => Promise<FileSystemFileHandle[]>;
  }
}

interface FileSystemFileHandle {
  name: string;
  createWritable: () => Promise<FileSystemWritableFileStream>;
  getFile: () => Promise<File>;
}

interface FileSystemWritableFileStream extends WritableStream {
  write: (data: Blob | string) => Promise<void>;
  close: () => Promise<void>;
}

interface StoredFileMetadata {
  id: string;
  name: string;
  type: string;
  size: number;
  path: string;
  createdAt: string;
  metadata?: Record<string, any>;
}

// Check if the File System Access API is available
const isFileSystemAccessAPIAvailable = 
  typeof window !== 'undefined' && 
  (window.showSaveFilePicker !== undefined) && 
  (window.showOpenFilePicker !== undefined);

export const FileSystemStorage = {
  // Check if the File System Access API is available
  isAvailable(): boolean {
    return isFileSystemAccessAPIAvailable;
  },

  // Store a file on the local file system
  async uploadFile(file: File, metadata: Record<string, any> = {}): Promise<string> {
    try {
      if (!isFileSystemAccessAPIAvailable) {
        throw new Error('File System Access API is not available in this browser');
      }

      // Request permission to save the file
      const fileHandle = await window.showSaveFilePicker?.({
        suggestedName: file.name,
        types: [{
          description: 'RAF Cadet Files',
          accept: { [file.type]: [file.name.split('.').pop() || ''] },
        }],
      });

      if (!fileHandle) {
        throw new Error('Failed to get file handle');
      }
      
      // Create a writable stream and write the file
      const writable = await fileHandle.createWritable();
      await writable.write(file);
      await writable.close();
      
      // Store metadata in localStorage
      const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const fileMetadata: StoredFileMetadata = {
        id: fileId,
        name: file.name,
        type: file.type,
        size: file.size,
        path: fileHandle.name,
        createdAt: new Date().toISOString(),
        metadata
      };
      
      // Update file index
      const fileIndex = JSON.parse(localStorage.getItem('fsFileIndex') || '[]');
      fileIndex.push(fileId);
      localStorage.setItem(`fs_file_${fileId}`, JSON.stringify(fileMetadata));
      localStorage.setItem('fsFileIndex', JSON.stringify(fileIndex));
      
      return fileId;
    } catch (error) {
      console.error('Error saving file:', error);
      throw new Error('Failed to save file to local file system');
    }
  },

  // Get file metadata
  async getFileMetadata(fileId: string): Promise<StoredFileMetadata | null> {
    const fileData = localStorage.getItem(`fs_file_${fileId}`);
    if (!fileData) return null;
    return JSON.parse(fileData);
  },

  // Get file as a Blob
  async getFileAsBlob(fileId: string): Promise<Blob | null> {
    const metadata = await this.getFileMetadata(fileId);
    if (!metadata) return null;
    
    try {
      if (!isFileSystemAccessAPIAvailable) {
        throw new Error('File System Access API is not available in this browser');
      }

      // In a real implementation, we would need to prompt the user to select the file again
      // since we can't access the file system without user interaction
      const fileHandles = await window.showOpenFilePicker?.({
        multiple: false,
        types: [{
          description: 'RAF Cadet Files',
          accept: { [metadata.type]: [metadata.name.split('.').pop() || ''] },
        }],
      });

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
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  },

  // List all stored files
  listFiles(): string[] {
    return JSON.parse(localStorage.getItem('fsFileIndex') || '[]');
  },

  // Delete a file (only removes the reference, doesn't delete the actual file)
  deleteFile(fileId: string): void {
    localStorage.removeItem(`fs_file_${fileId}`);
    const fileIndex = this.listFiles();
    const newIndex = fileIndex.filter((id: string) => id !== fileId);
    localStorage.setItem('fsFileIndex', JSON.stringify(newIndex));
  },

  // Clear all file references (doesn't delete actual files)
  clearAllFiles(): void {
    const fileIndex = this.listFiles();
    fileIndex.forEach((fileId: string) => {
      localStorage.removeItem(`fs_file_${fileId}`);
    });
    localStorage.removeItem('fsFileIndex');
  }
};
