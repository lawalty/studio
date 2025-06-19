// Minimal content for /start/audio-text to avoid build errors during rollback
'use client';
import React from 'react';

export default function MinimalPagePlaceholder() {
  return (
    <div>
      <p>This page is part of a rolled-back feature and should be deleted.</p>
    </div>
  );
}
