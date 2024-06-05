import { byFolder } from '../../lib/cloudinary';

export default async function handler(req, res) {
  const params = JSON.parse(req.body);

  console.log({params})
  const results = await byFolder(params);

console.log({results})

  res.status(200).json({ ...results });
}
