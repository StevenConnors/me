export type HeldPlacesSlide = {
  id: string;
  kind?: 'image' | 'video';
  src: string;
  poster?: string;
  srcSet?: string;
  mobileSrcSet?: string;
  alt: string;
  caption?: string;
  width?: number;
  height?: number;
  desktopPosition: string;
  mobilePosition: string;
};
