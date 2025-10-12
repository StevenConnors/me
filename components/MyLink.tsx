import Link from 'next/link';
import { ReactNode } from 'react';

interface MyLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export default function MyLink({ href, children, className, style }: MyLinkProps) {
  return (
    <Link 
      href={href}
      style={{ textDecoration: 'none' }}
    >
      <div 
        className={className}
        style={{ 
          cursor: 'pointer',
          color: 'black',
          fontSize: '1.5rem',
          fontWeight: '300',
          letterSpacing: '0.05em',
          ...style
        }}
        onMouseEnter={(e) => (e.target as HTMLElement).style.color = '#009900'}
        onMouseLeave={(e) => (e.target as HTMLElement).style.color = 'black'}
      >
        {children}
      </div>
    </Link>
  );
}
