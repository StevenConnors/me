'use client';

interface BackToGalleryLinkProps {
  href: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export default function BackToGalleryLink({ href, children, style }: BackToGalleryLinkProps) {
  return (
    <a 
      href={href}
      style={{
        display: 'inline-block',
        padding: '0.75rem 1.5rem',
        backgroundColor: '#007bff',
        color: 'white',
        textDecoration: 'none',
        borderRadius: '4px',
        fontSize: '0.9rem',
        transition: 'background-color 0.2s',
        ...style
      }}
      onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#0056b3'}
      onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#007bff'}
    >
      {children}
    </a>
  );
}
