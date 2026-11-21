const WIDTH = 240;
const QUALITY = 0.72;
// Mobile me pehla frame hi lena - seeking se delay hoti hai phone pe
const INTO_VIDEO = 1;
const isMobile = () => /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

/** A small picture of a video for the project list. */
export async function makeThumbnail(file: File) {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  // Mobile me preload=metadata faster hota hai, full video load nahi karta
  video.preload = 'metadata';
  video.src = url;
  try {
    await new Promise<void>((loaded, failed) => {
      video.onloadedmetadata = () => { loaded(); };
      video.onerror = failed;
      // Safety timeout: 3s max on mobile, 6s on desktop
      setTimeout(() => loaded(), isMobile() ? 3000 : 6000);
    });

    // Mobile pe seek skip karo if the video is long (avoid stalling)
    if (!isMobile() || video.duration < 10) {
      video.currentTime = Math.min(INTO_VIDEO, video.duration / 2);
      await new Promise<void>((seeked) => {
        video.onseeked = () => seeked();
        setTimeout(() => seeked(), 1500); // max 1.5s wait on seek
      });
    }

    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = video.videoHeight > 0
      ? Math.round((WIDTH * video.videoHeight) / video.videoWidth)
      : WIDTH;
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/jpeg', QUALITY));
  } finally {
    URL.revokeObjectURL(url);
  }
}
