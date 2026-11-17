'use client';

import { useEffect } from 'react';

export function MediaErrorHandler() {
  useEffect(() => {
    // 1. Filter out MediaPipe & TensorFlow Lite WASM C++ logs that Emscripten routes to console.error
    const originalConsoleError = console.error;
    console.error = function (...args: any[]) {
      const msg = typeof args[0] === 'string' ? args[0] : '';
      if (
        msg.includes('TensorFlow Lite') ||
        msg.includes('XNNPACK') ||
        msg.includes('inference_feedback_manager') ||
        msg.includes('gl_context') ||
        msg.includes('vision_wasm_internal')
      ) {
        // Route C++ stdout/stderr INFO and WARNING logs to console.info so Next.js dev overlay doesn't flag them as runtime errors
        console.info(...args);
        return;
      }
      originalConsoleError.apply(console, args);
    };

    // 2. Prevent Next.js runtime error modal from showing for normal browser play/pause race conditions
    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      if (
        reason?.name === 'AbortError' ||
        (typeof reason?.message === 'string' &&
          (reason.message.includes('play()') ||
            reason.message.includes('pause()') ||
            reason.message.includes('interrupted')))
      ) {
        event.preventDefault();
      }
    };

    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      console.error = originalConsoleError;
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  return null;
}
