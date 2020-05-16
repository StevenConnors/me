import fs from 'fs'
import path from 'path'

const imgDir = path.join(process.cwd(), 'public/images');

export function getImages() {
  // Get file names under /images
  return fs.readdirSync(imgDir)
}
