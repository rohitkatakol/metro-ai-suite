// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { CameraAnalyticsPage } from '@/components/MainPage'

// Camera-specific deep link: /cameras/<camera_id> (e.g. /cameras/nx:device-123).
// No router dependency needed — nginx SPA fallback already serves index.html
// for this path, so we just inspect the URL once on load.
function Root() {
  const match = window.location.pathname.match(/^\/cameras\/(.+?)\/?$/);
  if (match) {
    return <CameraAnalyticsPage cameraId={decodeURIComponent(match[1])} />;
  }
  return <App />;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
