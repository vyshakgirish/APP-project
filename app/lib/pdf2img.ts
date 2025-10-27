import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

export interface PdfConversionResult {
    imageUrl: string;
    file: File | null;
    error?: string;
}

let pdfjsLib: any = null;
let isLoading = false;
let loadPromise: Promise<any> | null = null;

/**
 * Dynamically loads the pdf.js library and sets up the worker.
 * Uses a promise to ensure the library is only loaded once.
 */
async function loadPdfJs(): Promise<any> {
    // If the library is already loaded, return it immediately.
    if (pdfjsLib) return pdfjsLib;
    // If a load is already in progress, return the existing promise.
    if (loadPromise) return loadPromise;

    isLoading = true;

    // Dynamically import the pdf.js library.
    // The "@ts-expect-error" is a good practice for this kind of import.
    // @ts-expect-error - pdfjs-dist/build/pdf.mjs is not a module
    loadPromise = import("pdfjs-dist/build/pdf.mjs").then((lib) => {
        // Set the worker source to the correct URL provided by the bundler.
        // This is the key fix to ensure the worker loads correctly.
        lib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        pdfjsLib = lib;
        isLoading = false;
        return lib;
    });

    return loadPromise;
}

/**
 * Converts the first page of a given PDF file to a PNG image file.
 * @param file The PDF file to convert.
 * @returns A promise that resolves to a PdfConversionResult object containing the image URL and File object, or an error.
 */
export async function convertPdfToImage(
    file: File
): Promise<PdfConversionResult> {
    try {
        const lib = await loadPdfJs();

        // Convert the file to an ArrayBuffer for pdf.js to process.
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await lib.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1);

        // Define the scale for the image to be rendered.
        const viewport = page.getViewport({ scale: 4 });
        
        // Create an in-memory canvas element to render the PDF page.
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        // Set the canvas dimensions based on the viewport.
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        // Enable image smoothing for a higher quality render.
        if (context) {
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = "high";
        }

        // Render the PDF page onto the canvas.
        await page.render({ canvasContext: context!, viewport }).promise;

        // Return a new promise to handle the async blob creation.
        return new Promise((resolve) => {
            canvas.toBlob(
                (blob) => {
                    if (blob) {
                        // Create a new File object from the blob.
                        const originalName = file.name.replace(/\.pdf$/i, "");
                        const imageFile = new File([blob], `${originalName}.png`, {
                            type: "image/png",
                        });

                        resolve({
                            imageUrl: URL.createObjectURL(blob),
                            file: imageFile,
                        });
                    } else {
                        // Handle the case where blob creation fails.
                        resolve({
                            imageUrl: "",
                            file: null,
                            error: "Failed to create image blob",
                        });
                    }
                },
                "image/png",
                1.0
            ); // Set quality to maximum (1.0)
        });
    } catch (err) {
        // Catch and return any errors that occur during the process.
        return {
            imageUrl: "",
            file: null,
            error: `Failed to convert PDF: ${err}`,
        };
    }
}
