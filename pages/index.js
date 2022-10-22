import { useState, useEffect } from 'react';
import Head from 'next/head'
import Image from 'next/image'
import Header from '../components/header'

export default function About({images}) {
  return (
    <>
      <Header />
      
      <br></br>
      <br></br>

      <div>
        The name 佑治 means  &#39;heal the person to your right&#39;. Whoever you may be, I hope I can be that person for you.
      </div>

      <ul >
          {images.map(image => {
            return (
              <li key={image.id}>
                <a href={image.link} rel="noreferrer">
                  <div>
                    <Image width={image.width} height={image.height} src={image.image} alt="" />
                  </div>
                  <h3 >
                    { image.title }
                  </h3>
                </a>
              </li>
            )
          })}
        </ul>
    </>
  )
}

export async function getStaticProps() {
  const results = await fetch(`https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/resources/image`, {
    headers: {
      Authorization: `Basic ${Buffer.from(process.env.CLOUDINARY_API_KEY + ':' + process.env.CLOUDINARY_API_SECRET).toString('base64')}`
    }
  }).then(r => r.json());

  console.log({results});

  
  const { resources } = results;

  const images = resources.map(resource => {
    const { width, height } = resource;
    return {
      id: resource.asset_id,
      title: resource.public_id,
      image: resource.secure_url,
      width,
      height
    }
  });

  return {
    props: {
      images
    }
  }
}
