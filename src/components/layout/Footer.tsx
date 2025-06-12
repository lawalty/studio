
import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-card border-t border-border mt-auto">
      <div className="container mx-auto px-4 py-4 text-center text-muted-foreground">
        <p className="text-sm">
          © {new Date().getFullYear()} AI Chat. All rights reserved.
          <Link href="/admin" className="ml-4 text-xs text-accent hover:underline">
            Admin Area
          </Link>
        </p>
      </div>
    </footer>
  );
}
