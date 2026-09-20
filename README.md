This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

For the local browser-based authoring workflow test, see [the E2E authoring guide](docs/e2e-authoring.md).

## Cloudinary photo maintenance

The Photos page reads image records from MongoDB's `media_assets` collection.
The scripts below load credentials from `.env.local`, inspect every uploaded
Cloudinary image, and are dry runs unless `--apply` is passed.

Run the cleanup before importing, so the gallery receives one record per exact
original image:

```bash
npm run media:dedupe
npm run media:dedupe -- --apply
npm run media:import-photos
npm run media:import-photos -- --apply
```

`media:dedupe` uses Cloudinary's original-file `etag`, so it only considers
byte-for-byte duplicates. It never deletes an image already registered in
`media_assets`; those may be referenced by a journey. Read the dry-run report
before applying it. `media:import-photos` creates missing media records and
sets `showInPhotos: true`, which makes the images eligible for `/photos`.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `pages/index.js`. The page auto-updates as you edit the file.

[API routes](https://nextjs.org/docs/api-routes/introduction) can be accessed on [http://localhost:3000/api/hello](http://localhost:3000/api/hello). This endpoint can be edited in `pages/api/hello.js`.

The `pages/api` directory is mapped to `/api/*`. Files in this directory are treated as [API routes](https://nextjs.org/docs/api-routes/introduction) instead of React pages.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js/) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.
