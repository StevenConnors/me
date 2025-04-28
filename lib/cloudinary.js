import { CLOUDINARY_QUALITY_TRANSFORM } from '../config';

export async function search(options = {}) {
    const params = {
      ...options
    }
    if ( options.nextCursor ) {
        params.next_cursor = options.nextCursor
        delete params.nextCursor;
      }

    const paramString = Object.keys(params).map(key => `${key}=${encodeURIComponent(params[key])}`).join('&');

    const url = `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/resources/search?${paramString}`;
    
    console.log("cloudinary serach url : ", url);

    const results = await fetch(url, {
      headers: {
        Authorization: `Basic ${Buffer.from(process.env.CLOUDINARY_API_KEY + ':' + process.env.CLOUDINARY_API_SECRET).toString('base64')}`
      }
    }).then(r => r.json());
    return results;
  }

export function getTransformedImageUrl(url) {
  if (url.includes("q_50")) return url;
  const index = url.indexOf("image/upload");
  if (index === -1) return url;
  const prefix = url.substring(0, index + "image/upload/".length);
  const rest = url.substring(index + "image/upload/".length);
  return prefix + CLOUDINARY_QUALITY_TRANSFORM + rest;
}

export function mapImageResources(resources) {
    if (!resources) {
        return [];
    }
    return resources.map(resource => {
      const { width, height, asset_id, public_id, secure_url } = resource;
      // Placeholder for future event/trip info
      return {
        id: asset_id,
        title: public_id,
        image: getTransformedImageUrl(secure_url),
        width,
        height,
        event: null, // to be filled in future
        description: '', // to be filled in future
      };
    });
}

export async function byFolder(options = {}) {
  const params = {
    ...options
  }
  if ( options.nextCursor ) {
      params.next_cursor = options.nextCursor
      delete params.nextCursor;
    }

  const paramString = Object.keys(params).map(key => `${key}=${encodeURIComponent(params[key])}`).join('&');

  const url = `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/resources/image?${paramString}`;
  
  console.log("cloudinary serach url : ", url);

  const results = await fetch(url, {
    headers: {
      Authorization: `Basic ${Buffer.from(process.env.CLOUDINARY_API_KEY + ':' + process.env.CLOUDINARY_API_SECRET).toString('base64')}`
    }
  }).then(r => r.json());

  return results;
}