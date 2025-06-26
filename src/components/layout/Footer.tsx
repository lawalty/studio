
'use client';

import { useState, useEffect } from 'react';

export default function Footer() {
  const [year, setYear] = useState(new Date().getFullYear());

  useEffect(() => {
    setYear(new Date().getFullYear());
  }, []);

  return (
    <footer className="bg-card border-t border-border mt-auto">
      <div className="container mx-auto px-4 py-4 text-center text-muted-foreground">
        <p className="text-sm">
          © {year} AI Chat. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
