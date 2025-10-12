import { CLOUDINARY_QUALITY_TRANSFORM } from '../config';
import type { ImageLoader } from 'next/image';

export const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

export const cloudinaryLoader: ImageLoader = ({ src, width, quality }) => {
  const q = quality || 'auto';
  return `https://res.cloudinary.com/${cloudName}/image/upload/f_auto,q_${q},c_fill,w_${width}/${src}`;
};

export function cldVideoMp4(publicId: string, opts: { w?: number } = {}) {
  const w = opts?.w ? `,c_limit,w_${opts.w}` : '';
  return `https://res.cloudinary.com/${cloudName}/video/upload/f_auto,q_auto${w}/${publicId}.mp4`;
}

export async function search(options: any = {}) {
    const params: any = {
      ...options
    }
    if ( options.nextCursor ) {
        params.next_cursor = options.nextCursor
        delete params.nextCursor;
      }

    const paramString = Object.keys(params).map(key => `${key}=${encodeURIComponent(params[key])}`).join('&');

    const url = `https://api.cloudinary.com/v1_1/${cloudName}/resources/search?${paramString}`;
    
    console.log("cloudinary serach url : ", url);

    const results = await fetch(url, {
      headers: {
        Authorization: `Basic ${Buffer.from(process.env.CLOUDINARY_API_KEY + ':' + process.env.CLOUDINARY_API_SECRET).toString('base64')}`
      }
    }).then(r => r.json());
    return results;
  }

export function getTransformedImageUrl(url: string) {
  if (url.includes("q_50")) return url;
  const index = url.indexOf("image/upload");
  if (index === -1) return url;
  const prefix = url.substring(0, index + "image/upload/".length);
  const rest = url.substring(index + "image/upload/".length);
  return prefix + CLOUDINARY_QUALITY_TRANSFORM + rest;
}

export function mapImageResources(resources: any[]) {
    if (!resources) {
        return [];
    }
    return resources.map((resource: any) => {
      const { width, height, asset_id, public_id, secure_url } = resource;
      // Placeholder for future event/trip info
      return {
        id: asset_id,
        title: public_id,
        image: public_id, // Use public_id so cloudinaryLoader can handle transformation
        width,
        height,
        event: null, // to be filled in future
        description: '', // to be filled in future
      };
    });
}

export async function byFolder(options: any = {}) {
  const params: any = {
    ...options
  }
  if ( options.nextCursor ) {
      params.next_cursor = options.nextCursor
      delete params.nextCursor;
    }

  const paramString = Object.keys(params).map(key => `${key}=${encodeURIComponent(params[key])}`).join('&');

  const url = `https://api.cloudinary.com/v1_1/${cloudName}/resources/image?${paramString}`;
  
  console.log("cloudinary serach url : ", url);

  const results = await fetch(url, {
    headers: {
      Authorization: `Basic ${Buffer.from(process.env.CLOUDINARY_API_KEY + ':' + process.env.CLOUDINARY_API_SECRET).toString('base64')}`
    }
  }).then(r => r.json());

  return results;
}