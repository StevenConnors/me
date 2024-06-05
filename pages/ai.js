import { useState, useEffect } from 'react';
import ImageGallery from '../components/imageGallery';
import Head from 'next/head'
import Link from 'next/link'
import styles from '../components/header.module.css'
import { mapImageResources } from '../lib/cloudinary';



const locations = [
    { name: "Piedmont, 04/2024"},
    { name: "Helsinki, 04/2024"},
    { name: "埼玉, 令和四年五月"},
    { name: "San Francisco, 04/2024"},
    { name: "New York, 03/2024"},
    { name: "Montreal, 02/2024"},
    { name: "Ain Sokhna, 03/2020"},
    { name: "Brooklyn, 03/2023"},
    { name: "Cairo, 05/2023"},
    { name: "Jackson Hole, August 2023"} 
  ];

  const locationToFolderId = [
    { name: "Piedmont, 04/2024", folderId: "yuji/photosByDateAndLocation/2024_04_Piedmont"},
    { name: "Helsinki, 04/2024", folderId: "yuji/photosByDateAndLocation/2024_04_Helsinki"},
    { name: "埼玉, 令和四年五月", folderId: "yuji/photosByDateAndLocation/2024_04_Tokyo"},
    { name: "San Francisco, 04/2024", folderId: "yuji/photosByDateAndLocation/2024_04_SanFrancisco"},
    { name: "New York, 03/2024", folderId: "yuji/photosByDateAndLocation/2024_03_NewYork"},
    { name: "Montreal, 02/2024", folderId: "yuji/photosByDateAndLocation/2024_02_Montreal"},
    { name: "Ain Sokhna, 03/2020", folderId: "yuji/byEvent/Ain_Sokhna_Egypt"},
    { name: "Brooklyn, 03/2023", folderId: "yuji/byEvent/Brooklyn_NY"},
    { name: "Cairo, 05/2023", folderId: "yuji/byEvent/Cairo_Egypt"},
    { name: "Jackson Hole, August 2023", folderId: "yuji/byEvent/JacksonHole_WY" } 
  ];

  
export default function NewPage({ defaultImages }) {

  const [imagesByLocation, setImagesByLocation] = useState(defaultImages);
  const [selectedLocationIndex, setSelectedLocationIndex] = useState(null);
  const [showCatchphrase, setShowCatchphrase] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowCatchphrase(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  async function onClickEventHandler(folderId) {
    let expr = `asset_folder=${folderId}`;
    console.log("searching for ", expr);
    const results = await fetch(`/api/search?cb=${new Date().getTime()}`, {
        method: 'POST',
        body: JSON.stringify({
            expression: expr,
            max_results: 25,
        })
    }).then(r => r.json());


    const { resources } = results;
    console.log("found ", res);

    const res = mapImageResources(resources);
  
    // Injecting the q_50 string to decrease the quality of the photo from cloudinary
    // and the width to limit the max width
    res.map(imgDoc => {
        let url = imgDoc.image;
        
        if (url.indexOf("q_50") > 0) {
        return;
        }

        let index = url.indexOf("image/upload");
        let prefix = url.substr(0, index + "image/upload/".length);
        let q = "w_1000/q_50/"
        let rest = url.substr(index+ "image/upload/".length)

        imgDoc.image = prefix + q + rest;
    })

    setImagesByLocation(prev => ({
      ...prev,
      [folderId]: (prev[folderId] || []).concat(res)
    }));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <Head>
        <title>yuji tanaka</title>
      </Head>
      
      <Link href="/about" passHref>  
        <h1 className={styles.titleText}>佑治</h1>
      </Link>
      
      <br></br>
      <br></br>

        <div style={{ flex: 1 }}>
          {locations.map((location, index) => (
            <div
              key={index}
              style={{ color: 'lightgrey', fontSize: '6rem', fontFamily: 'Serif', cursor: 'pointer', lineHeight: '1.2' }}
              onMouseEnter={(e) => e.target.style.color = 'black'}
              onMouseLeave={(e) => e.target.style.color = 'lightgrey'}
              onClick={() => {
                  setSelectedLocationIndex(index === selectedLocationIndex ? null : index);
                  const selectedFolderId = locationToFolderId.find(loc => loc.name === location.name).folderId;
                  console.log("Selected Folder ID:", selectedFolderId); // Log the folder ID
                  onClickEventHandler(selectedFolderId);
              }}
            >
              <span className={styles.fullName}>{location.name}</span>
              <span className={styles.shortName}>{location.name.split(',')[0]}</span> {/* Shortened name */}
              
              {selectedLocationIndex === index && imagesByLocation[locationToFolderId[index].folderId]?.length > 0 && (
                <div style={{ width: '100%' }}>
                  <ImageGallery key={index} images={imagesByLocation[locationToFolderId[selectedLocationIndex].folderId]} className="ai-gallery" />
                </div>
              )}
            </div>
          ))}
        </div>
    </div>
  );
}


export async function getStaticProps() {
//   const promises = locationToFolderId.map(async loc => {
//     const results = await fetch(`https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/resources/image?max_results=3&folder=${loc.folderId}`, {
//       headers: {
//         Authorization: `Basic ${Buffer.from(process.env.CLOUDINARY_API_KEY + ':' + process.env.CLOUDINARY_API_SECRET).toString('base64')}`,
//       }
//     }).then(r => r.json());

//     const res = mapImageResources(results.resources);  
//     // Injecting the q_30 string to decrease the quality of the photo from cloudinary
//     // and the width to limit the max width
//     res.map(imgDoc => {
//         let url = imgDoc.image;
        
//         if (url.indexOf("q_50") > 0) {
//         return;
//         }
//         let index = url.indexOf("image/upload");
//         let prefix = url.substr(0, index + "image/upload/".length);
//         let q = "w_1000/q_30/"
//         let rest = url.substr(index+ "image/upload/".length)
//         imgDoc.image = prefix + q + rest;
//     })

//     return { [loc.folderId]: res };
//   });
//   const imagesArrays = await Promise.all(promises);
//   const defaultImages = imagesArrays.reduce((acc, curr) => ({ ...acc, ...curr }), {});
//   console.log({defaultImages});

  const defaultImages = {};

  return {
    props: {
      defaultImages,
      defaultNextCursor: null 
    }
  }
}
