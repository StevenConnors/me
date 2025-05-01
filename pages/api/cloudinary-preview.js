import { byFolder, mapImageResources } from '../../lib/cloudinary';

export default async function handler(req, res) {
  const { folder, limit } = req.query;
  try {
    const result = await byFolder({ prefix: folder, max_results: limit || 2 });
    const images = mapImageResources(result.resources);
    res.status(200).json({ images });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch images' });
  }
} 