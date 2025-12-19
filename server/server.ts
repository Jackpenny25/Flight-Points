import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = 3001;
const DATA_DIR = path.join(__dirname, '../data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
// Ensure directories exist
[DATA_DIR, UPLOADS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});
// Initialize data files
const dataFiles = ['cadets', 'attendance'];
dataFiles.forEach(file => {
  const filePath = path.join(DATA_DIR, `${file}.json`);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '[]', 'utf-8');
  }
});
// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage });
// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));
// Helper functions
const readData = (type: string) => {
  try {
    const data = fs.readFileSync(path.join(DATA_DIR, `${type}.json`), 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading ${type}:`, error);
    return [];
  }
};
const writeData = (type: string, data: any) => {
  try {
    fs.writeFileSync(
      path.join(DATA_DIR, `${type}.json`),
      JSON.stringify(data, null, 2),
      'utf-8'
    );
  } catch (error) {
    console.error(`Error writing ${type}:`, error);
    throw error;
  }
};
// Test route
app.get('/api/test', (req, res) => {
  res.json({ message: 'Server is working!' });
});
// CRUD Endpoints
app.get('/api/data/:type', (req, res) => {
  try {
    const { type } = req.params;
    const data = readData(type);
    res.json(data);
  } catch (error) {
    console.error('Error in GET /api/data/:type:', error);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});
app.get('/api/data/:type/:id', (req, res) => {
  try {
    const { type, id } = req.params;
    const data = readData(type);
    const item = data.find((item: any) => item.id === id);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json(item);
  } catch (error) {
    console.error('Error in GET /api/data/:type/:id:', error);
    res.status(500).json({ error: 'Failed to fetch item' });
  }
});
app.post('/api/data/:type', (req, res) => {
  try {
    const { type } = req.params;
    const data = readData(type);
    const newItem = { ...req.body, id: Date.now().toString() };
    const updatedData = [...data, newItem];
    writeData(type, updatedData);
    res.status(201).json(newItem);
  } catch (error) {
    console.error('Error in POST /api/data/:type:', error);
    res.status(500).json({ error: 'Failed to create data' });
  }
});
app.put('/api/data/:type/:id', (req, res) => {
  try {
    const { type, id } = req.params;
    const data = readData(type);
    const updated = data.map((item: any) => 
      item.id === id ? { ...item, ...req.body, id } : item
    );
    writeData(type, updated);
    res.json({ success: true });
  } catch (error) {
    console.error('Error in PUT /api/data/:type/:id:', error);
    res.status(500).json({ error: 'Failed to update data' });
  }
});
app.delete('/api/data/:type/:id', (req, res) => {
  try {
    const { type, id } = req.params;
    const data = readData(type);
    const filtered = data.filter((item: any) => item.id !== id);
    writeData(type, filtered);
    res.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/data/:type/:id:', error);
    res.status(500).json({ error: 'Failed to delete data' });
  }
});
// File upload endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ 
      success: true, 
      file: {
        url: fileUrl,
        filename: req.file.filename,
        originalname: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
      }
    });
  } catch (error) {
    console.error('Error handling file upload:', error);
    res.status(500).json({ error: 'Failed to handle file upload' });
  }
});
// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
  console.log(`Uploads directory: ${UPLOADS_DIR}`);
});