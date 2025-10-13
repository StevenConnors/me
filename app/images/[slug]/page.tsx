import { notFound } from 'next/navigation';
import Image from 'next/image';
import Header from '../../../components/header';
import BackToGalleryLink from '../../../components/BackToGalleryLink';
import { mapImageResources } from '../../../lib/cloudinary';
import { CLOUDINARY_IMAGE_FOLDER_ID } from '../../../config';
import fs from 'fs';
import path from 'path';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { promises as fsPromises } from 'fs';

interface PhotoPageProps {
  params: Promise<{
    slug: string;
  }>;
}

interface ImageData {
  id: string;
  title: string;
  image: string;
  width: number;
  height: number;
  event: string | null;
  description: string;
}

async function getImageData(slug: string): Promise<ImageData | null> {
  try {
    console.log('getImageData - looking for slug:', slug);
    
    // Fetch all images from Cloudinary
    const url = `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/resources/image?max_results=500&folder="${CLOUDINARY_IMAGE_FOLDER_ID}`;
    
    const results = await fetch(url, {
      headers: {
        Authorization: `Basic ${Buffer.from(process.env.CLOUDINARY_API_KEY + ':' + process.env.CLOUDINARY_API_SECRET).toString('base64')}`,
      },
    }).then(r => r.json());
    
    const { resources } = results;
    const images = mapImageResources(resources);
    
    console.log('getImageData - found images:', images.length);
    console.log('getImageData - first few titles:', images.slice(0, 3).map((img: ImageData) => img.title));
    
    // Find the image that matches the slug
    const image = images.find((img: ImageData) => img.title === slug);
    console.log('getImageData - found matching image:', image);
    
    return image || null;
  } catch (error) {
    console.error('Error fetching image data:', error);
    return null;
  }
}

async function getMdxContent(slug: string): Promise<string | null> {
  try {
    const mdxPath = path.join(process.cwd(), 'content', 'photos', `${slug}.mdx`);
    const content = await fsPromises.readFile(mdxPath, 'utf8');
    return content;
  } catch (error) {
    // MDX file doesn't exist, which is fine
    return null;
  }
}

export default async function PhotoPage({ params }: PhotoPageProps) {
  const { slug } = await params;
  
  console.log('PhotoPage - slug:', slug);
  
  const imageData = await getImageData(slug);
  
  console.log('PhotoPage - imageData:', imageData);
  
  if (!imageData) {
    console.log('PhotoPage - No image data found, calling notFound()');
    notFound();
  }
  
  const mdxContent = await getMdxContent(slug);
  
  return (
    <>
      <Header />
      
      <div style={{ padding: '2rem 0', maxWidth: '1200px', margin: '0 auto', paddingLeft: '1rem', paddingRight: '1rem' }}>
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ 
            fontSize: '2rem', 
            fontWeight: '300', 
            marginBottom: '1rem',
            textAlign: 'center'
          }}>
            {imageData.title}
          </h1>
          
          <div style={{ 
            textAlign: 'center', 
            marginBottom: '2rem',
            fontSize: '0.9rem',
            color: '#666',
            fontFamily: 'monospace'
          }}>
            Cloudinary Path: {imageData.image}
          </div>
        </div>
        
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center',
          gap: '2rem'
        }}>
          {/* Image */}
          <div style={{ 
            position: 'relative',
            width: '100%',
            maxWidth: '800px',
            aspectRatio: `${imageData.width}/${imageData.height}`,
            borderRadius: '8px',
            overflow: 'hidden',
            boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
          }}>
            <Image
              src={`https://res.cloudinary.com/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload/f_auto,q_auto,c_fill,w_1200/${imageData.image}`}
              alt={imageData.title}
              fill
              style={{ objectFit: 'cover' }}
              sizes="(max-width: 768px) 100vw, 800px"
              priority
            />
          </div>
          
          {/* MDX Content */}
          {mdxContent && (
            <div style={{ 
              width: '100%',
              maxWidth: '800px',
              padding: '2rem',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
              border: '1px solid #e9ecef'
            }}>
              <h2 style={{ 
                fontSize: '1.5rem', 
                fontWeight: '400', 
                marginBottom: '1rem',
                color: '#333'
              }}>
                About This Photo
              </h2>
              <div style={{ 
                lineHeight: '1.6',
                color: '#555'
              }}>
                <MDXRemote source={mdxContent} />
              </div>
            </div>
          )}
          
          {/* Back to Gallery Link */}
          <div style={{ textAlign: 'center', marginTop: '2rem' }}>
            <BackToGalleryLink href="/gallery">
              ← Back to Gallery
            </BackToGalleryLink>
          </div>
        </div>
      </div>
    </>
  );
}

export async function generateStaticParams() {
  try {
    // Fetch all images to generate static params
    const url = `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/resources/image?max_results=500&folder="${CLOUDINARY_IMAGE_FOLDER_ID}`;
    
    const results = await fetch(url, {
      headers: {
        Authorization: `Basic ${Buffer.from(process.env.CLOUDINARY_API_KEY + ':' + process.env.CLOUDINARY_API_SECRET).toString('base64')}`,
      },
    }).then(r => r.json());
    
    const { resources } = results;
    const images = mapImageResources(resources);
    
    return images.map((image: ImageData) => ({
      slug: image.title,
    }));
  } catch (error) {
    console.error('Error generating static params:', error);
    return [];
  }
}
