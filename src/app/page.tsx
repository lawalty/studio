
'use client';

import React from 'react';

// This is a temporary, minimal page for debugging a deployment issue.
// It has no external dependencies to ensure it can be rendered by the server
// without causing a silent crash.

export default function StartPage() {
  return (
    <div style={{ fontFamily: 'sans-serif', textAlign: 'center', padding: '50px', color: '#0A192F', backgroundColor: '#E0E0E0', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ maxWidth: '600px', padding: '40px', border: '1px solid #D9D9D9', borderRadius: '8px', backgroundColor: '#FFFFFF' }}>
        <h1 style={{ fontSize: '2em', color: '#708090', marginBottom: '20px' }}>
          Deployment Test Successful
        </h1>
        <p style={{ fontSize: '1.1em', lineHeight: '1.6' }}>
          The container has successfully started, and the server is rendering this page.
        </p>
        <p style={{ fontSize: '1.1em', lineHeight: '1.6', marginTop: '20px' }}>
          This confirms the problem lies within the original <strong>page.tsx</strong> file or one of its dependencies, which was causing a crash on the first request. We can now proceed with fixing the original page.
        </p>
      </div>
    </div>
  );
}
