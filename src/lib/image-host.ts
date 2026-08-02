const IMAGE_HOSTS = ["i.ibb.co", "ufs.sh", "res.cloudinary.com"];

export function getImageHost(url: string): string | null {
  try {
    const { hostname } = new URL(url);
    return IMAGE_HOSTS.some((h) => hostname === h || hostname.endsWith("." + h))
      ? hostname
      : null;
  } catch {
    return null;
  }
}
