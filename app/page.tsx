"use client";

import { useEffect } from 'react';
import App from '../src/app/App';
import { LOCAL_MODE } from '../utils/config';

export default function Page() {
  useEffect(() => {
    if (LOCAL_MODE) {
      import('../src/utils/localApiShim').then(m => m.enableLocalMode()).catch(() => {});
    }
  }, []);

  return <App />;
}
