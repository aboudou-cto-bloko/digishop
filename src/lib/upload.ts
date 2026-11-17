/** Upload direct vers le stockage Convex, avec progression (XHR, car fetch n'expose pas l'avancement). */
export function uploadToConvex(
  uploadUrl: string,
  file: File,
  onProgress?: (ratio: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      try {
        const body: unknown = JSON.parse(xhr.responseText);
        if (xhr.status < 300 && body && typeof body === "object" && "storageId" in body && typeof body.storageId === "string") {
          resolve(body.storageId);
        } else reject(new Error("Échec de l'envoi du fichier"));
      } catch {
        reject(new Error("Échec de l'envoi du fichier"));
      }
    };
    xhr.onerror = () => reject(new Error("Connexion interrompue pendant l'envoi"));
    xhr.send(file);
  });
}
