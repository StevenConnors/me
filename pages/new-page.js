import { useState, useEffect } from 'react';
import ImageGallery from '../components/imageGallery';
import Head from 'next/head'
import Link from 'next/link'
import styles from '../components/header.module.css'

export default function NewPage() {
  const [selectedLocationIndex, setSelectedLocationIndex] = useState(null);
  const [images, setImages] = useState([]);
  const [showCatchphrase, setShowCatchphrase] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowCatchphrase(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  const locations = [
    { name: "Hawaii, 04/2022", images: references.slice(0,10)},
    { name: "Tokyo, 03/2023", images: references.slice(10,20)},
    { name: "Paris, 05/2023", images: references.slice(20,30)},
    { name: "埼玉、令和４年５月", images: references.slice(30,40)},
    { name: "Sydney, 01/2023", images: references.slice(40,50)},
    { name: "Cairo, 02/2023", images: references.slice(50,60)},
    { name: "London, July 2023", images: references.slice(2, 22) },
    { name: "Berlin, August 2023", images: references.slice(12, 32) },
    { name: "Sydney, January 2023", images: references.slice(40,50)},
    { name: "Cairo, February 2023", images: references.slice(50,60)},
    { name: "London, July 2023", images: references.slice(2, 22) },
    { name: "Berlin, August 2023", images: references.slice(12, 32) }
  ];

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
              onClick={() => setSelectedLocationIndex(index === selectedLocationIndex ? null : index)}
            >
              {location.name}
              {selectedLocationIndex === index && (
                <div style={{ width: '100%' }}>
                  <ImageGallery images={location.images} />
                </div>
              )}
            </div>
          ))}
        </div>
    </div>
  );
}

var references = [
    {
        "id": "2e39c77e46d225a7a3b65ed683940f6f",
        "title": "new/IMG_3641_p8s0tg",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357795/new/IMG_3641_p8s0tg.jpg",
        "width": 4032,
        "height": 3024
    },
    {
        "id": "e9d6bbe5bf72cc072bdb2480a06d8b3d",
        "title": "new/IMG_3610_cbabfo",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357795/new/IMG_3610_cbabfo.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "e5402e057f5ad0faf276bc618e374964",
        "title": "new/IMG_8610_ysols7",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357794/new/IMG_8610_ysols7.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "94092cdb6ab05b67eddbaf5784ac554d",
        "title": "new/IMG_2421_hpqxup",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357792/new/IMG_2421_hpqxup.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "cf7d610b188e352742f21eeda281ee78",
        "title": "new/IMG_7930_s7sb8p",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357791/new/IMG_7930_s7sb8p.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "64619e814af25f424b18b85e2b78b58a",
        "title": "new/IMG_8462_raithe",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357787/new/IMG_8462_raithe.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "19056d525fcc3b893500e4668f749ce8",
        "title": "new/IMG_9894_cco8c1",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357787/new/IMG_9894_cco8c1.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "84ba9598b5384dc62ef574d4becf94e0",
        "title": "new/IMG_4613_lkewyt",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357787/new/IMG_4613_lkewyt.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "0664e3a0444e5c7c724e10fba5e2879d",
        "title": "new/IMG_7086_nsvhuj",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357785/new/IMG_7086_nsvhuj.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "0f6041b7ad9420c055ca190a61d9066a",
        "title": "new/IMG_8328_1_ds7u1s",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357784/new/IMG_8328_1_ds7u1s.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "149a814cb01a9ed8c490b6b88d2b1b1f",
        "title": "new/IMG_0682_l0y3sv",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357784/new/IMG_0682_l0y3sv.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "6a1c6cea38b50911cb77232a54a183ef",
        "title": "new/IMG_3127_jqzb6m",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357783/new/IMG_3127_jqzb6m.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "e988710de3fd5c867bf43af7e247172e",
        "title": "new/IMG_4273_glivsm",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357783/new/IMG_4273_glivsm.jpg",
        "width": 4032,
        "height": 3024
    },
    {
        "id": "e6414e8c1cce478197410926c81365d5",
        "title": "new/IMG_7115_1_jj8omg",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357779/new/IMG_7115_1_jj8omg.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "cbae54cb20fbbde8e1f01cf6be326bcf",
        "title": "new/IMG_2027_zh6mfr",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357778/new/IMG_2027_zh6mfr.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "7fc82cafb93ad7fa60d6be6034d5fa03",
        "title": "new/IMG_1033_dfj7t9",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357775/new/IMG_1033_dfj7t9.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "686054f14e810aacdffaa4e7b1f3e8c5",
        "title": "new/IMG_2531_zyjr5a",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357774/new/IMG_2531_zyjr5a.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "724adc05d495e7ae53b54e1ee315bb2b",
        "title": "new/IMG_1084_1_heohvh",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357773/new/IMG_1084_1_heohvh.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "8e9fd0a9f602ca188e6b6053582acc4b",
        "title": "new/IMG_6536_hefrfj",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357770/new/IMG_6536_hefrfj.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "8accd7bbad11ec8c7bf5fd2693715606",
        "title": "new/IMG_3382_kmxtrq",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357769/new/IMG_3382_kmxtrq.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "80882c4a0f82a52b52e282932ee711fb",
        "title": "new/IMG_3424_g4di5l",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357768/new/IMG_3424_g4di5l.jpg",
        "width": 4032,
        "height": 3024
    },
    {
        "id": "3e930ec17a8f0a80bc0224f22847b747",
        "title": "new/IMG_1047_bae4pc",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357768/new/IMG_1047_bae4pc.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "4c164244bd4a3779a90dc32ebdd243bb",
        "title": "new/IMG_3418_c1pboc",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357766/new/IMG_3418_c1pboc.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "ee42c42b918a522f58de428860cc6b3c",
        "title": "new/IMG_2818_lzfuxc",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357763/new/IMG_2818_lzfuxc.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "3cff6eb4147061f514a5df7904b68413",
        "title": "new/IMG_0910_u2oypp",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357764/new/IMG_0910_u2oypp.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "bff07d5f31da98914166a33b5907c6d0",
        "title": "new/IMG_1392_kcafcf",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357762/new/IMG_1392_kcafcf.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "938eede87d593dccfa95172de08d11e9",
        "title": "new/IMG_5307_nwykq3",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357761/new/IMG_5307_nwykq3.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "963d99d4a5b82315665f79194bd84f9e",
        "title": "new/IMG_3088_ejfjy1",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357760/new/IMG_3088_ejfjy1.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "da332ff3d8b15c0ec4b7f335b31929f6",
        "title": "new/IMG_3422_vehbsg",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357759/new/IMG_3422_vehbsg.jpg",
        "width": 4032,
        "height": 3024
    },
    {
        "id": "9206de78c2cd39fbd54bbcb09e8c5a63",
        "title": "new/IMG_3003_f29rr6",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357757/new/IMG_3003_f29rr6.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "dd8ea41c93878b1ce3d0fa403d5a14f4",
        "title": "new/IMG_8206_invbhi",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357756/new/IMG_8206_invbhi.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "e1967e1d1d5bc853cd2650383d47c49f",
        "title": "new/IMG_0856_vquq8r",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357756/new/IMG_0856_vquq8r.jpg",
        "width": 4032,
        "height": 3024
    },
    {
        "id": "92aaf41cba59c9606639f500485637d1",
        "title": "new/IMG_1144_1_iutmww",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357754/new/IMG_1144_1_iutmww.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "7d5b5108023b636c42b415ebf11f5722",
        "title": "new/IMG_4114_n6g0oo",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357752/new/IMG_4114_n6g0oo.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "bbde8082f243206dc381a81699120b31",
        "title": "new/IMG_1370_gyaah8",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357752/new/IMG_1370_gyaah8.jpg",
        "width": 4032,
        "height": 3024
    },
    {
        "id": "5b24486a44cddfeac88fc521f97ff1cf",
        "title": "new/IMG_2026_gq3d9f",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357752/new/IMG_2026_gq3d9f.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "71e2907c7a8b17eb0ff71173fd3c7d02",
        "title": "new/IMG_4154_zbilqb",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357748/new/IMG_4154_zbilqb.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "00c85d098f8fc6f0f2c9f28b65a3f99e",
        "title": "new/IMG_2911_yidd9t",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357746/new/IMG_2911_yidd9t.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "9bc9bb7dc7ac903c7406519fd431b5ff",
        "title": "new/IMG_3427_ykx4bb",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357745/new/IMG_3427_ykx4bb.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "fe5deab1e0402aac285d8ea9039da09c",
        "title": "new/IMG_0974_suvmmo",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357746/new/IMG_0974_suvmmo.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "d60ad2f6ee4832747bac75af32904f8f",
        "title": "new/IMG_5567_wji4lx",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357745/new/IMG_5567_wji4lx.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "d126d7cb3a9c098d22b1e0d08492b2fa",
        "title": "new/IMG_1964_hnngoq",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357743/new/IMG_1964_hnngoq.jpg",
        "width": 4032,
        "height": 3024
    },
    {
        "id": "aa6e36d85aab432139a46f97a2a45891",
        "title": "new/IMG_1460_ys2lig",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357741/new/IMG_1460_ys2lig.jpg",
        "width": 2160,
        "height": 3840
    },
    {
        "id": "1e4949cd71e1f546b83cf738e67d6e26",
        "title": "new/IMG_3050_revcwt",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357739/new/IMG_3050_revcwt.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "48f039b113b300dd4c8e3124584cee47",
        "title": "new/IMG_9128_yvkxfu",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357738/new/IMG_9128_yvkxfu.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "a66bc2e9729afe1ce2c299fc24a68585",
        "title": "new/IMG_1126_1_skdmt4",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357735/new/IMG_1126_1_skdmt4.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "7ef9cc66e517d617f7dafbfc7df5e9ed",
        "title": "new/IMG_7255_1_go4obw",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357733/new/IMG_7255_1_go4obw.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "1fe6ccdb633f6f6ae127dd56a4307895",
        "title": "new/IMG_5625_ei0ozo",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357733/new/IMG_5625_ei0ozo.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "fd0b2151d28339f0a7a45a87c15bc049",
        "title": "new/IMG_1880_xz9ahh",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357732/new/IMG_1880_xz9ahh.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "ec8b69ce2b645e4d567827bcd0850b61",
        "title": "new/IMG_5280_abtqes",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357731/new/IMG_5280_abtqes.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "6e89cfce699ee6158bf863ec48ab71ca",
        "title": "new/IMG_2184_x0bmfg",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357730/new/IMG_2184_x0bmfg.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "0052196af7dca3a0639d41f73987d9f7",
        "title": "new/IMG_0361_rgq0oe",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357731/new/IMG_0361_rgq0oe.jpg",
        "width": 4032,
        "height": 3024
    },
    {
        "id": "8035a3816308e73605fb34b951629e80",
        "title": "new/IMG_3413_fucigk",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357730/new/IMG_3413_fucigk.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "cac0c1a5724c26a31b2f26f4e43e3fc7",
        "title": "new/IMG_3048_boge9o",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357730/new/IMG_3048_boge9o.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "7e1a4b82cc46afcf75ee0dc640f1a305",
        "title": "new/IMG_2727_lh1f2q",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357730/new/IMG_2727_lh1f2q.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "b06e79d712306ff1f0681ab6ba7352a1",
        "title": "new/IMG_1139_1_rydefj",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357729/new/IMG_1139_1_rydefj.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "9ad28b9321020c1be03f44c32a9ae090",
        "title": "new/IMG_0601_i4oykz",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357728/new/IMG_0601_i4oykz.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "adeca1cc5a4e03895f4e1a652cb7e1ad",
        "title": "new/IMG_3485_z9vixa",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357728/new/IMG_3485_z9vixa.jpg",
        "width": 3024,
        "height": 4032
    },
    {
        "id": "e8c558c99251e3b597e48fd3a5599984",
        "title": "new/IMG_9455_imppg7",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357728/new/IMG_9455_imppg7.jpg",
        "width": 3024,
        "height": 3328
    },
    {
        "id": "88aa5cbc7d6e42f767260d83a4c5ff42",
        "title": "new/IMG_0488_so0ksm",
        "image": "https://res.cloudinary.com/dwsenj1bp/image/upload/w_1000/q_50/v1666357726/new/IMG_0488_so0ksm.jpg",
        "width": 3024,
        "height": 4032
    }
]