# Travel Story Website - Quickstart Guide

## Overview
This is a scroll-synced storytelling website built with Next.js and Cloudinary. It showcases photos and videos with accompanying text, featuring smooth crossfade transitions as users scroll through content.

## Features
- **Desktop Layout**: Two-column layout (left: text, right: sticky media)
- **Mobile Layout**: Stacked layout (sticky media on top, text below)
- **Scroll Sync**: Media transitions smoothly as you scroll through text
- **Crossfade Transitions**: Smooth transitions between images and videos
- **Cloudinary Integration**: Optimized image and video delivery
- **MDX Support**: Write stories in Markdown with React components

## Quick Setup

### 1. Environment Setup
Copy the example environment file and set your Cloudinary cloud name:
```bash
cp .env.local.example .env.local
```

Edit `.env.local` and set your Cloudinary cloud name:
```
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your_actual_cloud_name
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Run Development Server
```bash
npm run dev
```

### 4. View the Story
Open [http://localhost:3000/stories/poc](http://localhost:3000/stories/poc) in your browser.

## Project Structure

```
/app
  /stories/[slug]
    page.tsx              # Story page route
/components
  Story.tsx               # Main layout and context provider
  Step.tsx                # Individual story step component
  MediaPanel.tsx          # Media display with crossfade
/lib
  cloudinary.js           # Cloudinary utilities and loader
/content
  /stories
    poc.mdx               # Sample story content
```

## Creating New Stories

### 1. Create MDX File
Create a new `.mdx` file in `/content/stories/`:

```mdx
import { Step } from '../../components/Step';

# Your Story Title

<Step media="your-folder/image-001">
Your first story step text here...
</Step>

<Step media="your-folder/video-001" kind="video">
Your video step description...
</Step>

<Step media="your-folder/image-002">
Your second story step text here...
</Step>
```

### 2. Upload Media to Cloudinary
Upload your images and videos to Cloudinary with the folder structure:
- `your-folder/image-001.jpg`
- `your-folder/video-001.mp4`

### 3. Access Your Story
Visit `/stories/your-story-name` to view your new story.

## Media Requirements

### Images
- Supported formats: JPG, PNG, WebP
- Recommended size: 1920x1080 or similar
- Cloudinary will automatically optimize with `f_auto,q_auto`

### Videos
- Supported formats: MP4, WebM
- Recommended: Short clips (5-30 seconds)
- Videos auto-play muted and loop
- Controls are available for user interaction

## Customization

### Styling
The project uses Tailwind CSS. You can customize:
- Colors in `tailwind.config.js`
- Layout breakpoints
- Animation durations
- Typography styles

### Story Components
- Modify `Step.tsx` to change step styling
- Update `MediaPanel.tsx` for different transition effects
- Customize `Story.tsx` for layout changes

## Deployment

### Vercel (Recommended)
1. Push your code to GitHub
2. Connect your repository to Vercel
3. Set environment variables in Vercel dashboard
4. Deploy

### Other Platforms
The project is a standard Next.js application and can be deployed to any platform that supports Next.js.

## Troubleshooting

### Images Not Loading
- Verify `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` is set correctly
- Check that images exist in your Cloudinary account
- Ensure the media paths in your MDX match your Cloudinary folder structure

### Build Errors
- Run `npm run build` to check for TypeScript errors
- Ensure all dependencies are installed
- Check that MDX files have proper imports

### Performance Issues
- Images are automatically optimized by Cloudinary
- Videos are served with `f_auto,q_auto` for optimal quality/size balance
- Next.js Image component provides lazy loading and responsive sizing

## Next Steps

### Potential Enhancements
- Add more story pages
- Implement story navigation
- Add metadata and SEO optimization
- Include analytics tracking
- Add reduced motion support
- Implement HLS video streaming for longer videos

### Content Management
- Consider adding a CMS for easier content management
- Implement dynamic story loading
- Add story categories and tags
- Create an admin interface for story creation

## Support

For issues or questions:
1. Check the browser console for errors
2. Verify environment variables are set correctly
3. Ensure all media files exist in Cloudinary
4. Check that the development server is running properly
